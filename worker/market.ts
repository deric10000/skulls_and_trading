/**
 * Worker-side free-tier market proxy: app-wide cache, rate-limit budgets,
 * Yahoo (primary, no key) + optional Finnhub. Secrets stay on the Worker.
 */

import {
  type CandleTime,
  type OhlcvBar,
  type TimeframedIndicatorsPayload,
  TIMEFRAME_FETCH,
  INTRADAY_TIMES,
  candleTtlMs,
  computeTimeframedIndicators,
  emptyTimeframedIndicators,
  resampleHourlyBars,
  resampleTo4h,
} from "./indicators";
import { sanitizeFundamentals } from "./metricSanity";

export interface MarketEnv {
  FINNHUB_API_KEY?: string;
  FRED_API_KEY?: string;
}

export type ProviderId = "yahoo" | "finnhub" | "fred" | "stooq";

export interface ProviderBudget {
  id: ProviderId;
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface QuotePayload {
  ticker: string;
  lastPrice: number;
  asOf: string;
  source: "live";
  provider: ProviderId;
}

export interface SearchHit {
  symbol: string;
  name: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CronTechnicalBundle {
  quote: QuotePayload;
  technicals: Record<string, unknown>;
  byTimeframe: Partial<Record<CandleTime, TimeframedIndicatorsPayload>>;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * Quote TTL is market-hours aware: quotes move during the US regular session so
 * cache briefly (~5 min) to serve fresher intraday numbers to Forge cadence
 * auto-refresh; when the market is closed quotes are stable, so hold a full day
 * to conserve upstream quota. Fundamentals/technicals stay daily.
 */
const QUOTE_TTL_MARKET_MS = 5 * MINUTE_MS;
const QUOTE_TTL_CLOSED_MS = DAY_MS;
const FUNDY_TTL_MS = DAY_MS;
const SEARCH_TTL_MS = 10 * MINUTE_MS;

/** True during US regular hours (09:30–16:00 ET, Mon–Fri). */
function isUsRegularMarketHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  return mins >= 9 * 60 + 30 && mins <= 16 * 60;
}

function quoteTtlMs(): number {
  return isUsRegularMarketHours() ? QUOTE_TTL_MARKET_MS : QUOTE_TTL_CLOSED_MS;
}

const quoteCache = new Map<string, CacheEntry<QuotePayload>>();
const searchCache = new Map<string, CacheEntry<SearchHit[]>>();
const fundyCache = new Map<string, CacheEntry<Record<string, unknown>>>();
const techCache = new Map<string, CacheEntry<Record<string, unknown>>>();
/** Per symbol×timeframe indicator bundle (candle TTL during market hours). */
const tfTechCache = new Map<string, CacheEntry<TimeframedIndicatorsPayload>>();
const contextCache = new Map<string, CacheEntry<Record<string, unknown>>>();

const budgets: Record<ProviderId, ProviderBudget> = {
  yahoo: { id: "yahoo", remaining: 30, limit: 30, resetAt: 0 },
  finnhub: { id: "finnhub", remaining: 60, limit: 60, resetAt: 0 },
  fred: { id: "fred", remaining: 120, limit: 120, resetAt: 0 },
  stooq: { id: "stooq", remaining: 30, limit: 30, resetAt: 0 },
};

const inFlight = new Map<string, Promise<unknown>>();

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface YahooSession {
  cookie: string;
  crumb: string;
  expiresAt: number;
}

let yahooSession: YahooSession | null = null;
let yahooSessionInFlight: Promise<YahooSession | null> | null = null;

function collectSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((c) => c.split(";")[0]!).filter(Boolean);
  }
  const single = res.headers.get("set-cookie");
  return single ? [single.split(";")[0]!] : [];
}

/** Yahoo blocks crumb-less quote/quoteSummary; chart still works without crumb. */
async function createYahooSession(): Promise<YahooSession | null> {
  const cookies: string[] = [];
  try {
    const fc = await fetch("https://fc.yahoo.com", {
      headers: { "user-agent": YAHOO_UA },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    cookies.push(...collectSetCookies(fc));
  } catch {
    // ignore — getcrumb often works without fc
  }
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "user-agent": YAHOO_UA,
      cookie: cookies.join("; "),
    },
    signal: AbortSignal.timeout(12_000),
  });
  cookies.push(...collectSetCookies(crumbRes));
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("<") || crumb.length > 120) {
    yahooSession = null;
    return null;
  }
  yahooSession = {
    cookie: [...new Set(cookies)].join("; "),
    crumb,
    expiresAt: Date.now() + 30 * MINUTE_MS,
  };
  return yahooSession;
}

async function ensureYahooSession(): Promise<YahooSession | null> {
  if (yahooSession && Date.now() < yahooSession.expiresAt) return yahooSession;
  if (yahooSessionInFlight) return yahooSessionInFlight;
  yahooSessionInFlight = createYahooSession().finally(() => {
    yahooSessionInFlight = null;
  });
  return yahooSessionInFlight;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function refreshBudgetWindow(id: ProviderId, limit: number): void {
  const now = Date.now();
  const budget = budgets[id];
  if (now >= budget.resetAt) {
    budget.limit = limit;
    budget.remaining = limit;
    budget.resetAt = now + MINUTE_MS;
  }
}

function consumeBudget(id: ProviderId, limit: number): boolean {
  refreshBudgetWindow(id, limit);
  const budget = budgets[id];
  if (budget.remaining <= 0) return false;
  budget.remaining -= 1;
  return true;
}

function applyFinnhubHeaders(res: Response): void {
  const remaining = res.headers.get("X-Ratelimit-Remaining");
  const limit = res.headers.get("X-Ratelimit-Limit");
  const reset = res.headers.get("X-Ratelimit-Reset");
  if (remaining != null) budgets.finnhub.remaining = Number(remaining);
  if (limit != null) budgets.finnhub.limit = Number(limit);
  if (reset != null) {
    const resetNum = Number(reset);
    budgets.finnhub.resetAt =
      resetNum < 1e12 ? resetNum * 1000 : resetNum;
  }
}

async function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function fetchYahooQuote(symbol: string): Promise<QuotePayload | null> {
  if (!consumeBudget("yahoo", 30)) return null;
  // v7 /finance/quote is Unauthorized without auth; v8 chart.meta still works.
  const chart = await fetchYahooChart(symbol, "5d", "1d", { skipBudget: true });
  if (!chart) return null;
  const meta = (chart.meta ?? {}) as {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
    chartPreviousClose?: number;
  };
  const price =
    typeof meta.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : null;
  if (price == null || price <= 0) return null;
  const asOf = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();
  return {
    ticker: symbol.toUpperCase(),
    lastPrice: price,
    asOf,
    source: "live",
    provider: "yahoo",
  };
}

async function fetchFinnhubQuote(
  symbol: string,
  apiKey: string,
): Promise<QuotePayload | null> {
  if (!consumeBudget("finnhub", 60)) return null;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  applyFinnhubHeaders(res);
  if (!res.ok) return null;
  const data = (await res.json()) as { c?: number; t?: number };
  if (typeof data.c !== "number" || data.c <= 0) return null;
  return {
    ticker: symbol.toUpperCase(),
    lastPrice: data.c,
    asOf: data.t ? new Date(data.t * 1000).toISOString() : new Date().toISOString(),
    source: "live",
    provider: "finnhub",
  };
}

async function fetchStooqQuote(symbol: string): Promise<QuotePayload | null> {
  if (!consumeBudget("stooq", 30)) return null;
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = Number(cols[6]);
  const date = cols[1];
  if (!Number.isFinite(close) || close <= 0) return null;
  return {
    ticker: symbol.toUpperCase(),
    lastPrice: close,
    asOf: date && date !== "N/D" ? `${date}T20:00:00.000Z` : new Date().toISOString(),
    source: "live",
    provider: "stooq",
  };
}

async function resolveQuote(
  symbol: string,
  env: MarketEnv,
): Promise<QuotePayload | null> {
  const key = symbol.toUpperCase();
  const cached = cacheGet(quoteCache, key);
  if (cached) return cached;

  return singleFlight(`quote:${key}`, async () => {
    const again = cacheGet(quoteCache, key);
    if (again) return again;

    let quote: QuotePayload | null = null;
    if (env.FINNHUB_API_KEY) {
      quote = await fetchFinnhubQuote(key, env.FINNHUB_API_KEY);
    }
    if (!quote) quote = await fetchYahooQuote(key);
    if (!quote) quote = await fetchStooqQuote(key);
    if (quote) cacheSet(quoteCache, key, quote, quoteTtlMs());
    return quote;
  });
}

async function searchYahoo(query: string): Promise<SearchHit[]> {
  if (!consumeBudget("yahoo", 30)) return [];
  const session = await ensureYahooSession();
  const crumbQ = session
    ? `&crumb=${encodeURIComponent(session.crumb)}`
    : "";
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0${crumbQ}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": YAHOO_UA,
      ...(session?.cookie ? { cookie: session.cookie } : {}),
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }>;
  };
  return (data.quotes ?? [])
    .filter((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
    .map((q) => ({
      symbol: String(q.symbol).toUpperCase(),
      name: q.shortname || q.longname || String(q.symbol),
    }))
    .slice(0, 12);
}

export async function fetchYahooQuoteSummary(
  symbol: string,
): Promise<Record<string, unknown> | null> {
  if (!consumeBudget("yahoo", 30)) return null;
  const session = await ensureYahooSession();
  if (!session) return null;
  const modules = [
    "defaultKeyStatistics",
    "financialData",
    "summaryDetail",
    "earningsTrend",
    "calendarEvents",
  ].join(",");
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": YAHOO_UA,
      cookie: session.cookie,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    // Crumb may have expired — force refresh once.
    yahooSession = null;
    return null;
  }
  const data = (await res.json()) as {
    quoteSummary?: { result?: Array<Record<string, unknown>>; error?: { description?: string } };
    finance?: { error?: { code?: string } };
  };
  if (data.finance?.error || data.quoteSummary?.error) {
    yahooSession = null;
    return null;
  }
  return data.quoteSummary?.result?.[0] ?? null;
}

export async function fetchYahooChart(
  symbol: string,
  range = "1y",
  interval = "1d",
  opts?: { skipBudget?: boolean; includePrePost?: boolean },
): Promise<Record<string, unknown> | null> {
  if (!opts?.skipBudget && !consumeBudget("yahoo", 30)) return null;
  const prePost = opts?.includePrePost ? "&includePrePost=true" : "";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${prePost}`;
  const res = await fetch(url, {
    headers: { "user-agent": YAHOO_UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: { result?: Array<Record<string, unknown>> };
  };
  return data.chart?.result?.[0] ?? null;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` values, then smooth forward.
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i += 1) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

export function extractBars(chart: Record<string, unknown>): OhlcvBar[] {
  const timestamps = (chart.timestamp ?? []) as Array<number | null>;
  const indicators = chart.indicators as
    | {
        quote?: Array<{
          open?: Array<number | null>;
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      }
    | undefined;
  const quote = indicators?.quote?.[0] ?? {};
  const opens = quote.open ?? [];
  const closes = quote.close ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const volumes = quote.volume ?? [];
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    const close = closes[i];
    const t = timestamps[i];
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    bars.push({
      t,
      close,
      open: typeof opens[i] === "number" && Number.isFinite(opens[i]!) ? opens[i] : null,
      high: typeof highs[i] === "number" && Number.isFinite(highs[i]!) ? highs[i] : null,
      low: typeof lows[i] === "number" && Number.isFinite(lows[i]!) ? lows[i] : null,
      volume:
        typeof volumes[i] === "number" && Number.isFinite(volumes[i]!)
          ? volumes[i]
          : null,
    });
  }
  return bars;
}

/** Last close of each calendar week (Monday-start), oldest → newest. */
function weeklyCloses(bars: OhlcvBar[]): number[] {
  const out: number[] = [];
  let lastWeek: number | null = null;
  for (const bar of bars) {
    // Epoch day 0 (Jan 1 1970) was a Thursday; +3 shifts week starts to Monday.
    const week = Math.floor((Math.floor(bar.t / 86_400) + 3) / 7);
    if (week !== lastWeek) {
      out.push(bar.close);
      lastWeek = week;
    } else {
      out[out.length - 1] = bar.close;
    }
  }
  return out;
}

/** 14-day ATR as % of the last close (simple TR mean; needs highs/lows). */
function atrPct(bars: OhlcvBar[], period = 14): number | null {
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    if (high == null || low == null) continue;
    ranges.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }
  if (ranges.length < period) return null;
  const atr = ranges.slice(-period).reduce((a, b) => a + b, 0) / period;
  const last = bars[bars.length - 1]?.close;
  return last ? (atr / last) * 100 : null;
}

/** 1Y daily beta vs a benchmark series, aligned on shared timestamps. */
function betaVsBenchmark(
  bars: OhlcvBar[],
  benchmark: { t: number[]; close: number[] } | null,
): number | null {
  if (!benchmark) return null;
  const benchByT = new Map<number, number>();
  for (let i = 0; i < benchmark.t.length; i += 1) {
    benchByT.set(benchmark.t[i], benchmark.close[i]);
  }
  const stock: number[] = [];
  const bench: number[] = [];
  for (const bar of bars) {
    const b = benchByT.get(bar.t);
    if (b != null) {
      stock.push(bar.close);
      bench.push(b);
    }
  }
  if (stock.length < 61) return null;
  const rs: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < stock.length; i += 1) {
    if (stock[i - 1] > 0 && bench[i - 1] > 0) {
      rs.push(stock[i] / stock[i - 1] - 1);
      rb.push(bench[i] / bench[i - 1] - 1);
    }
  }
  if (rs.length < 60) return null;
  const meanS = rs.reduce((a, b) => a + b, 0) / rs.length;
  const meanB = rb.reduce((a, b) => a + b, 0) / rb.length;
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < rs.length; i += 1) {
    cov += (rs[i] - meanS) * (rb[i] - meanB);
    varB += (rb[i] - meanB) ** 2;
  }
  if (varB === 0) return null;
  return cov / varB;
}

/** Cached 1y daily series (SPY beta benchmark + sector ETF changes). */
const seriesCache = new Map<string, CacheEntry<{ t: number[]; close: number[] }>>();

async function getDailySeries(
  symbol: string,
): Promise<{ t: number[]; close: number[] } | null> {
  const key = symbol.toUpperCase();
  const cached = cacheGet(seriesCache, key);
  if (cached) return cached;
  const chart = await fetchYahooChart(key, "1y", "1d");
  if (!chart) return null;
  const bars = extractBars(chart);
  if (bars.length === 0) return null;
  const series = { t: bars.map((b) => b.t), close: bars.map((b) => b.close) };
  cacheSet(seriesCache, key, series, DAY_MS);
  return series;
}

/** GICS sector SPDR ETFs — the only symbols the technicals route will fan out to. */
const SECTOR_ETFS = new Set([
  "XLE", "XLB", "XLI", "XLY", "XLP", "XLV", "XLF", "XLK", "XLC", "XLU", "XLRE",
]);

/** 1-month (21 trading days) % change of a sector ETF, from the cached series. */
async function sectorEtf1mChange(etf: string): Promise<number | null> {
  const series = await getDailySeries(etf);
  if (!series || series.close.length < 22) return null;
  const last = series.close[series.close.length - 1];
  const prior = series.close[series.close.length - 22];
  if (!prior) return null;
  return (last / prior - 1) * 100;
}

export function mapFundamentals(
  symbol: string,
  summary: Record<string, unknown>,
): Record<string, unknown> {
  // Module layout (Yahoo v10 quoteSummary):
  //   financialData        — margins, growth, ROE, cash flows, D/E (as PERCENT),
  //                          currentRatio, totalRevenue
  //   defaultKeyStatistics — EV/EBITDA, trailingEps, netIncomeToCommon
  //   summaryDetail        — trailingPE/forwardPE, P/S TTM, dividendYield,
  //                          payoutRatio (fractions)
  //   calendarEvents       — next earnings date (drives daysUntilEarnings)
  const financial = (summary.financialData ?? {}) as Record<string, { raw?: number }>;
  const keyStats = (summary.defaultKeyStatistics ?? {}) as Record<string, { raw?: number }>;
  const detail = (summary.summaryDetail ?? {}) as Record<string, { raw?: number }>;
  const raw = (obj: Record<string, { raw?: number }>, key: string): number | null => {
    const v = obj[key]?.raw;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  // Yahoo fractions (0.045) → percent (4.5) to match snapshot units.
  const pct = (v: number | null): number | null => (v != null ? v * 100 : null);
  // Raw dollars → $B to match the registry/snapshot "$B" unit.
  const toBillions = (v: number | null): number | null =>
    v != null ? v / 1_000_000_000 : null;

  const freeCashflow = raw(financial, "freeCashflow");
  const totalRevenue = raw(financial, "totalRevenue");

  // Next earnings date from calendarEvents (epoch seconds, may be a range —
  // take the first). Consumed client-side to compute daysUntilEarnings.
  const calendar = (summary.calendarEvents ?? {}) as {
    earnings?: { earningsDate?: Array<{ raw?: number }> };
  };
  const earningsRaw = calendar.earnings?.earningsDate?.[0]?.raw;
  const nextEarningsDate =
    typeof earningsRaw === "number" && Number.isFinite(earningsRaw)
      ? new Date(earningsRaw * 1000).toISOString().slice(0, 10)
      : null;

  const rawSnapshot = {
    ticker: symbol,
    revenueGrowthPct: pct(raw(financial, "revenueGrowth")),
    epsGrowthPct: pct(raw(financial, "earningsGrowth")),
    grossMarginPct: pct(raw(financial, "grossMargins")),
    operatingMarginPct: pct(raw(financial, "operatingMargins")),
    netMarginPct: pct(raw(financial, "profitMargins")),
    fcfMarginPct:
      freeCashflow != null && totalRevenue != null && totalRevenue > 0
        ? (freeCashflow / totalRevenue) * 100
        : null,
    returnOnEquityPct: pct(raw(financial, "returnOnEquity")),
    operatingCashFlow: toBillions(raw(financial, "operatingCashflow")),
    netIncome: toBillions(raw(keyStats, "netIncomeToCommon")),
    epsTtm: raw(keyStats, "trailingEps"),
    peRatio: raw(detail, "trailingPE") ?? raw(keyStats, "trailingPE"),
    forwardPE: raw(detail, "forwardPE") ?? raw(keyStats, "forwardPE"),
    priceToSales:
      raw(detail, "priceToSalesTrailing12Months") ??
      raw(keyStats, "priceToSalesTrailing12Months"),
    evToEbitda: raw(keyStats, "enterpriseToEbitda"),
    // financialData.debtToEquity is a PERCENT (e.g. 41.5) — snapshot scale is a
    // ratio (0.415), matching the mock seeds and default chip thresholds.
    debtToEquity:
      raw(financial, "debtToEquity") != null
        ? (raw(financial, "debtToEquity") as number) / 100
        : null,
    currentRatio: raw(financial, "currentRatio") ?? raw(keyStats, "currentRatio"),
    dividendYieldPct: pct(raw(detail, "dividendYield")),
    payoutRatioPct: pct(raw(detail, "payoutRatio") ?? raw(keyStats, "payoutRatio")),
    // Not available on free Yahoo/Finnhub/FRED paths — explicit null, never fabricated:
    // interest expense (interestCoverage), 5Y dividend history (dividendGrowth5yPct),
    // YoY share-count change (buybackYieldPct).
    interestCoverage: null,
    dividendGrowth5yPct: null,
    buybackYieldPct: null,
    nextEarningsDate,
    asOf: new Date().toISOString().slice(0, 10),
    source: "live" as const,
  };
  return sanitizeFundamentals(rawSnapshot);
}

const VALID_CANDLE_TIMES = new Set<CandleTime>([
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1D",
  "1W",
  "1M",
]);

function parseTimeframesParam(raw: string | null): CandleTime[] {
  if (!raw?.trim()) return [];
  const out: CandleTime[] = [];
  for (const part of raw.split(",")) {
    const tf = part.trim() as CandleTime;
    if (VALID_CANDLE_TIMES.has(tf) && !out.includes(tf)) out.push(tf);
  }
  return out.slice(0, 7);
}

async function resolveTimeframedIndicators(
  symbol: string,
  tf: CandleTime,
): Promise<TimeframedIndicatorsPayload> {
  const cacheKey = `${symbol}:${tf}`;
  const cached = cacheGet(tfTechCache, cacheKey);
  if (cached) return cached;

  const asOf = new Date().toISOString().slice(0, 10);
  const fetchSpec = TIMEFRAME_FETCH[tf];
  const chart = await fetchYahooChart(symbol, fetchSpec.range, fetchSpec.interval);
  if (!chart) {
    const empty = emptyTimeframedIndicators(asOf);
    cacheSet(tfTechCache, cacheKey, empty, candleTtlMs(tf, isUsRegularMarketHours()));
    return empty;
  }
  let bars = extractBars(chart);
  if (fetchSpec.resampleHours) {
    bars = resampleHourlyBars(bars, fetchSpec.resampleHours);
  }
  const payload = computeTimeframedIndicators(bars, {
    includeVwap: INTRADAY_TIMES.has(tf),
  });
  cacheSet(
    tfTechCache,
    cacheKey,
    payload,
    candleTtlMs(tf, isUsRegularMarketHours()),
  );
  return payload;
}

function mapTechnicalsFromBars(
  symbol: string,
  bars: OhlcvBar[],
  spy: { t: number[]; close: number[] } | null,
): Record<string, unknown> {
  const closes = bars.map((b) => b.close);
  const volumes = bars
    .map((b) => b.volume)
    .filter((v): v is number => v != null);
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema10 = ema(closes, 10);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const high52 = closes.length ? Math.max(...closes.slice(-252)) : null;
  const price3mAgo = closes.length >= 63 ? closes[closes.length - 63] : null;
  const avgVol20 =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;
  const vsEmaPct = (emaValue: number | null): number | null =>
    last != null && emaValue != null && emaValue > 0
      ? (last / emaValue - 1) * 100
      : null;

  return {
    ticker: symbol,
    priceAbove200dSma: last != null && sma200 != null ? (last > sma200 ? 1 : 0) : null,
    priceAbove50dSma: last != null && sma50 != null ? (last > sma50 ? 1 : 0) : null,
    priceAbove20dSma: last != null && sma20 != null ? (last > sma20 ? 1 : 0) : null,
    rsi14: rsi(closes, 14),
    weeklyRsi: rsi(weeklyCloses(bars), 14),
    drawdownFrom52wHighPct:
      last != null && high52 != null && high52 > 0
        ? ((high52 - last) / high52) * 100
        : null,
    priceChange3mPct:
      last != null && price3mAgo != null && price3mAgo !== 0
        ? ((last - price3mAgo) / price3mAgo) * 100
        : null,
    relativeVolume:
      avgVol20 != null && volumes.length
        ? volumes[volumes.length - 1] / avgVol20
        : null,
    // True VWAP needs intraday prints — daily bars can't produce an honest
    // value, so it stays null (excluded from live coverage) rather than faked.
    priceVsVwapPct: null,
    priceVs10EmaPct: vsEmaPct(ema10),
    priceVs20EmaPct: vsEmaPct(ema20),
    priceVs50EmaPct: vsEmaPct(ema50),
    // Filled client-side from fundamentals.nextEarningsDate (calendarEvents).
    daysUntilEarnings: null,
    atrPct14d: atrPct(bars, 14),
    beta1y: betaVsBenchmark(bars, spy),
    avgDollarVolume20d:
      avgVol20 != null && last != null ? (avgVol20 * last) / 1_000_000 : null,
    // Attached per-request in the route from the ?sectorEtf= param.
    sectorEtf1mChangePct: null,
    asOf: new Date().toISOString().slice(0, 10),
    source: "live",
  };
}

export function mapTechnicals(
  symbol: string,
  chart: Record<string, unknown>,
  spy: { t: number[]; close: number[] } | null,
): Record<string, unknown> {
  return mapTechnicalsFromBars(symbol, extractBars(chart), spy);
}

async function buildMarketContext(env: MarketEnv): Promise<Record<string, unknown>> {
  const cached = cacheGet(contextCache, "market");
  if (cached) return cached;

  const spyQuote = await resolveQuote("SPY", env);
  const chart = await fetchYahooChart("SPY", "1y", "1d");
  // No beta benchmark needed — context only reads SPY RSI + 200D SMA flag.
  const tech = chart ? mapTechnicals("SPY", chart, null) : null;
  let vix: number | null = null;
  const vixQuote = await resolveQuote("^VIX", env);
  if (vixQuote) vix = vixQuote.lastPrice;

  // Optional FRED: DGS10 (10Y Δ) + BAMLH0A0HYM2 (HY OAS % / credit stress).
  let treasury10y5dChangePct: number | null = null;
  let highYieldSpreadPct: number | null = null;
  if (env.FRED_API_KEY) {
    const fetchFred = async (seriesId: string, limit: number) => {
      if (!consumeBudget("fred", 120)) return null;
      const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${encodeURIComponent(env.FRED_API_KEY!)}&file_type=json&sort_order=desc&limit=${limit}`;
      const fredRes = await fetch(fredUrl);
      if (!fredRes.ok) return null;
      const fredData = (await fredRes.json()) as {
        observations?: Array<{ value?: string }>;
      };
      return (fredData.observations ?? [])
        .map((o) => Number(o.value))
        .filter((n) => Number.isFinite(n));
    };
    try {
      const dgs = await fetchFred("DGS10", 6);
      if (dgs && dgs.length >= 6) {
        treasury10y5dChangePct = dgs[0] - dgs[5];
      }
      const hy = await fetchFred("BAMLH0A0HYM2", 1);
      if (hy && hy.length >= 1) {
        highYieldSpreadPct = hy[0];
      }
    } catch {
      // leave null
    }
  }

  const payload = {
    vix,
    spyRsi: tech?.rsi14 ?? null,
    spyAbove200dSma: tech?.priceAbove200dSma ?? null,
    spy5dChangePct: null as number | null,
    highYieldSpreadPct,
    treasury10y5dChangePct,
    asOf: spyQuote?.asOf?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    source: "live",
  };

  if (chart && spyQuote) {
    const indicators = chart.indicators as
      | { quote?: Array<{ close?: Array<number | null> }> }
      | undefined;
    const closes = (indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    if (closes.length >= 6) {
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 6];
      if (prev) payload.spy5dChangePct = ((last - prev) / prev) * 100;
    }
  }

  cacheSet(contextCache, "market", payload, DAY_MS);
  return payload;
}

function aggregateBars(
  bars: OhlcvBar[],
  bucketFor: (bar: OhlcvBar) => string,
): OhlcvBar[] {
  const out: OhlcvBar[] = [];
  let bucket = "";
  for (const bar of bars) {
    const nextBucket = bucketFor(bar);
    const current = out[out.length - 1];
    if (!current || nextBucket !== bucket) {
      out.push({ ...bar });
      bucket = nextBucket;
      continue;
    }
    current.t = bar.t;
    current.close = bar.close;
    current.high =
      current.high == null
        ? bar.high
        : bar.high == null
          ? current.high
          : Math.max(current.high, bar.high);
    current.low =
      current.low == null
        ? bar.low
        : bar.low == null
          ? current.low
          : Math.min(current.low, bar.low);
    current.volume =
      current.volume == null && bar.volume == null
        ? null
        : (current.volume ?? 0) + (bar.volume ?? 0);
  }
  return out;
}

function intradayBucket(
  bar: OhlcvBar,
  timezoneOffsetSeconds: number,
  hours: 1 | 2 | 4,
): { key: string; closesAt: number } {
  const shifted = bar.t + timezoneOffsetSeconds;
  let day = Math.floor(shifted / 86_400);
  const seconds = ((shifted % 86_400) + 86_400) % 86_400;
  let session = "overnight";
  let anchor = 20 * 60 * 60;
  let sessionEnd = 28 * 60 * 60;
  let position = seconds;
  if (seconds < 4 * 60 * 60) {
    day -= 1;
    position += 86_400;
  } else if (seconds < 9.5 * 60 * 60) {
    session = "premarket";
    anchor = 4 * 60 * 60;
    sessionEnd = 9.5 * 60 * 60;
  } else if (seconds < 16 * 60 * 60) {
    session = "regular";
    anchor = 9.5 * 60 * 60;
    sessionEnd = 16 * 60 * 60;
  } else if (seconds < 20 * 60 * 60) {
    session = "afterhours";
    anchor = 16 * 60 * 60;
    sessionEnd = 20 * 60 * 60;
  }
  const bucket = Math.floor((position - anchor) / (hours * 60 * 60));
  const closesLocal = Math.min(
    day * 86_400 + anchor + (bucket + 1) * hours * 60 * 60,
    day * 86_400 + sessionEnd,
  );
  return {
    key: `${day}:${session}:${bucket}`,
    closesAt: closesLocal - timezoneOffsetSeconds,
  };
}

function resampleIntradayAtClose(
  bars: OhlcvBar[],
  hours: 2 | 4,
  timezoneOffsetSeconds: number,
  cycleCloseMs: number,
): OhlcvBar[] {
  const cycleCloseSeconds = Math.floor(cycleCloseMs / 1000);
  const closed = bars.filter(
    (bar) =>
      intradayBucket(bar, timezoneOffsetSeconds, hours).closesAt <=
      cycleCloseSeconds,
  );
  return aggregateBars(
    closed,
    (bar) => intradayBucket(bar, timezoneOffsetSeconds, hours).key,
  );
}

function resampleClosedBars(
  bars: OhlcvBar[],
  timezoneOffsetSeconds: number,
  cycleCloseMs: number,
): Record<"1D" | "1W" | "1M", OhlcvBar[]> {
  const shiftedDay = (bar: OhlcvBar) =>
    Math.floor((bar.t + timezoneOffsetSeconds) / 86_400);
  const shiftedCycleSeconds =
    Math.floor(cycleCloseMs / 1000) + timezoneOffsetSeconds;
  const currentDay = Math.floor(shiftedCycleSeconds / 86_400);
  const cycleSecondsOfDay =
    ((shiftedCycleSeconds % 86_400) + 86_400) % 86_400;
  const regularBars = bars.filter((bar) => {
    const seconds =
      ((bar.t + timezoneOffsetSeconds) % 86_400 + 86_400) % 86_400;
    const isRegular = seconds >= 9.5 * 60 * 60 && seconds < 16 * 60 * 60;
    const dayClosed =
      shiftedDay(bar) < currentDay || cycleSecondsOfDay >= 16 * 60 * 60;
    return isRegular && dayClosed;
  });
  const daily = aggregateBars(regularBars, (bar) => String(shiftedDay(bar)));
  const currentWeek = Math.floor((currentDay + 3) / 7);
  const cycleWeekday = new Date(shiftedCycleSeconds * 1000).getUTCDay();
  const weekly = aggregateBars(
    daily.filter((bar) => {
      const week = Math.floor((shiftedDay(bar) + 3) / 7);
      return (
        week < currentWeek ||
        (cycleWeekday === 5 && cycleSecondsOfDay >= 16 * 60 * 60)
      );
    }),
    (bar) => String(Math.floor((shiftedDay(bar) + 3) / 7)),
  );
  const currentShifted = new Date(shiftedCycleSeconds * 1000);
  const currentMonth = `${currentShifted.getUTCFullYear()}-${currentShifted.getUTCMonth()}`;
  const monthly = aggregateBars(daily, (bar) => {
    const shifted = new Date((bar.t + timezoneOffsetSeconds) * 1000);
    return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}`;
  }).filter((bar) => {
    const shifted = new Date((bar.t + timezoneOffsetSeconds) * 1000);
    return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}` !== currentMonth;
  });
  return { "1D": daily, "1W": weekly, "1M": monthly };
}

/**
 * One Yahoo 1h chart powers the hourly cycle's quote and every supported
 * technical Time. Indicators with insufficient lookback stay null.
 */
export async function fetchCronTechnicalBundle(
  symbol: string,
  cycleCloseMs: number,
): Promise<CronTechnicalBundle | null> {
  const chart = await fetchYahooChart(symbol, "1y", "1h", {
    includePrePost: true,
  });
  if (!chart) return null;
  const meta = (chart.meta ?? {}) as {
    gmtoffset?: number;
    regularMarketPrice?: number;
  };
  const timezoneOffsetSeconds = meta.gmtoffset ?? -5 * 60 * 60;
  const cycleCloseSeconds = Math.floor(cycleCloseMs / 1000);
  const bars = extractBars(chart).filter(
    (bar) =>
      intradayBucket(bar, timezoneOffsetSeconds, 1).closesAt <=
      cycleCloseSeconds,
  );
  const last = bars[bars.length - 1];
  if (!last) return null;

  const fourHour = resampleIntradayAtClose(
    bars,
    4,
    timezoneOffsetSeconds,
    cycleCloseMs,
  );
  const twoHour = resampleIntradayAtClose(
    bars,
    2,
    timezoneOffsetSeconds,
    cycleCloseMs,
  );
  const longer = resampleClosedBars(
    bars,
    timezoneOffsetSeconds,
    cycleCloseMs,
  );
  const asOf = new Date(last.t * 1000).toISOString();
  const byTimeframe: CronTechnicalBundle["byTimeframe"] = {
    "1h": computeTimeframedIndicators(bars, { includeVwap: true, asOf }),
    "2h": computeTimeframedIndicators(twoHour, { includeVwap: true, asOf }),
    "4h": computeTimeframedIndicators(fourHour, { includeVwap: true, asOf }),
    "1D": computeTimeframedIndicators(longer["1D"], { asOf }),
    "1W": computeTimeframedIndicators(longer["1W"], { asOf }),
    "1M": computeTimeframedIndicators(longer["1M"], { asOf }),
  };
  const technicals = mapTechnicalsFromBars(symbol, longer["1D"], null);
  return {
    quote: {
      ticker: symbol,
      lastPrice: last.close,
      asOf,
      source: "live",
      provider: "yahoo",
    },
    technicals: { ...technicals, asOf },
    byTimeframe,
  };
}

export async function fetchCronFundamentals(
  symbol: string,
): Promise<Record<string, unknown> | null> {
  const summary = await fetchYahooQuoteSummary(symbol);
  return summary ? mapFundamentals(symbol, summary) : null;
}

export async function fetchCronMarketContext(
  env: MarketEnv,
): Promise<Record<string, unknown>> {
  return buildMarketContext(env);
}

export async function handleMarketApi(
  request: Request,
  env: MarketEnv,
  pathname: string,
): Promise<Response | null> {
  if (!pathname.startsWith("/api/market/")) return null;

  if (pathname === "/api/market/budgets" && request.method === "GET") {
    (Object.keys(budgets) as ProviderId[]).forEach((id) => {
      refreshBudgetWindow(id, budgets[id].limit);
    });
    return json({ budgets: Object.values(budgets) });
  }

  if (pathname === "/api/market/quote" && request.method === "GET") {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
    if (!symbol) return json({ error: "symbol required" }, 400);
    const quote = await resolveQuote(symbol, env);
    if (!quote) return json({ quote: null, budgets: Object.values(budgets) }, 404);
    return json({ quote, budgets: Object.values(budgets) });
  }

  if (pathname === "/api/market/quotes" && request.method === "POST") {
    let symbols: string[] = [];
    try {
      const body = (await request.json()) as { symbols?: unknown };
      if (Array.isArray(body.symbols)) {
        symbols = body.symbols
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
      }
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    const unique = [...new Set(symbols)].slice(0, 40);
    const quotes: Record<string, QuotePayload> = {};
    for (const symbol of unique) {
      const quote = await resolveQuote(symbol, env);
      if (quote) quotes[symbol] = quote;
    }
    return json({ quotes, budgets: Object.values(budgets), asOf: new Date().toISOString() });
  }

  if (pathname === "/api/market/search" && request.method === "GET") {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return json({ hits: [] });
    const cacheKey = q.toLowerCase();
    const cached = cacheGet(searchCache, cacheKey);
    if (cached) return json({ hits: cached, budgets: Object.values(budgets) });
    const hits = await searchYahoo(q);
    cacheSet(searchCache, cacheKey, hits, SEARCH_TTL_MS);
    return json({ hits, budgets: Object.values(budgets) });
  }

  if (pathname === "/api/market/fundamentals" && request.method === "GET") {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
    if (!symbol) return json({ error: "symbol required" }, 400);
    const cached = cacheGet(fundyCache, symbol);
    if (cached) return json({ fundamentals: cached, budgets: Object.values(budgets) });
    const summary = await fetchYahooQuoteSummary(symbol);
    if (!summary) return json({ fundamentals: null, budgets: Object.values(budgets) });
    const fundamentals = mapFundamentals(symbol, summary);
    cacheSet(fundyCache, symbol, fundamentals, FUNDY_TTL_MS);
    return json({ fundamentals, budgets: Object.values(budgets) });
  }

  if (pathname === "/api/market/technicals" && request.method === "GET") {
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
    if (!symbol) return json({ error: "symbol required" }, 400);
    const sectorEtfParam = (url.searchParams.get("sectorEtf") ?? "")
      .trim()
      .toUpperCase();
    const sectorEtf = SECTOR_ETFS.has(sectorEtfParam) ? sectorEtfParam : null;
    const timeframes = parseTimeframesParam(url.searchParams.get("timeframes"));

    let technicals = cacheGet(techCache, symbol);
    if (!technicals) {
      const chart = await fetchYahooChart(symbol);
      if (!chart) return json({ technicals: null, budgets: Object.values(budgets) }, 404);
      const spy = await getDailySeries("SPY");
      technicals = mapTechnicals(symbol, chart, spy);
      cacheSet(techCache, symbol, technicals, FUNDY_TTL_MS);
    }
    // Sector ETF change is attached per request (cached per ETF) so the base
    // technicals cache stays keyed by symbol only.
    const sectorEtf1mChangePct = sectorEtf ? await sectorEtf1mChange(sectorEtf) : null;

    const byTimeframe: Partial<Record<CandleTime, TimeframedIndicatorsPayload>> =
      {};
    for (const tf of timeframes) {
      byTimeframe[tf] = await resolveTimeframedIndicators(symbol, tf);
    }

    return json({
      technicals: { ...technicals, sectorEtf1mChangePct },
      byTimeframe: timeframes.length ? byTimeframe : undefined,
      budgets: Object.values(budgets),
    });
  }

  if (pathname === "/api/market/context" && request.method === "GET") {
    const context = await buildMarketContext(env);
    return json({ context, budgets: Object.values(budgets) });
  }

  return json({ error: "not found" }, 404);
}
