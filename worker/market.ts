/**
 * Worker-side free-tier market proxy: app-wide cache, rate-limit budgets,
 * Yahoo (primary, no key) + optional Finnhub. Secrets stay on the Worker.
 */

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

function collectSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((c) => c.split(";")[0]!).filter(Boolean);
  }
  const single = res.headers.get("set-cookie");
  return single ? [single.split(";")[0]!] : [];
}

/** Yahoo blocks crumb-less quote/quoteSummary; chart still works without crumb. */
async function ensureYahooSession(): Promise<YahooSession | null> {
  if (yahooSession && Date.now() < yahooSession.expiresAt) return yahooSession;
  const cookies: string[] = [];
  try {
    const fc = await fetch("https://fc.yahoo.com", {
      headers: { "user-agent": YAHOO_UA },
      redirect: "manual",
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

async function fetchYahooQuoteSummary(
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

async function fetchYahooChart(
  symbol: string,
  range = "1y",
  interval = "1d",
  opts?: { skipBudget?: boolean },
): Promise<Record<string, unknown> | null> {
  if (!opts?.skipBudget && !consumeBudget("yahoo", 30)) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, {
    headers: { "user-agent": YAHOO_UA },
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

function mapFundamentals(
  symbol: string,
  summary: Record<string, unknown>,
): Record<string, unknown> {
  const financial = (summary.financialData ?? {}) as Record<string, { raw?: number }>;
  const keyStats = (summary.defaultKeyStatistics ?? {}) as Record<string, { raw?: number }>;
  const detail = (summary.summaryDetail ?? {}) as Record<string, { raw?: number }>;
  const raw = (obj: Record<string, { raw?: number }>, key: string): number | null => {
    const v = obj[key]?.raw;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  return {
    ticker: symbol,
    revenueGrowthPct: raw(financial, "revenueGrowth") != null
      ? (raw(financial, "revenueGrowth") as number) * 100
      : null,
    epsGrowthPct: raw(financial, "earningsGrowth") != null
      ? (raw(financial, "earningsGrowth") as number) * 100
      : null,
    grossMarginPct: raw(financial, "grossMargins") != null
      ? (raw(financial, "grossMargins") as number) * 100
      : null,
    operatingMarginPct: raw(financial, "operatingMargins") != null
      ? (raw(financial, "operatingMargins") as number) * 100
      : null,
    netMarginPct: raw(financial, "profitMargins") != null
      ? (raw(financial, "profitMargins") as number) * 100
      : null,
    returnOnEquityPct: raw(financial, "returnOnEquity") != null
      ? (raw(financial, "returnOnEquity") as number) * 100
      : null,
    operatingCashFlow: raw(financial, "operatingCashflow"),
    peRatio: raw(detail, "trailingPE") ?? raw(keyStats, "trailingPE"),
    forwardPE: raw(detail, "forwardPE") ?? raw(keyStats, "forwardPE"),
    priceToSales: raw(keyStats, "priceToSalesTrailing12Months"),
    evToEbitda: raw(keyStats, "enterpriseToEbitda"),
    debtToEquity: raw(keyStats, "debtToEquity"),
    currentRatio: raw(keyStats, "currentRatio"),
    dividendYieldPct: raw(detail, "dividendYield") != null
      ? (raw(detail, "dividendYield") as number) * 100
      : null,
    payoutRatioPct: raw(keyStats, "payoutRatio") != null
      ? (raw(keyStats, "payoutRatio") as number) * 100
      : null,
    beta1y: raw(keyStats, "beta"),
    asOf: new Date().toISOString().slice(0, 10),
    source: "live",
  };
}

function mapTechnicals(
  symbol: string,
  chart: Record<string, unknown>,
): Record<string, unknown> {
  const indicators = chart.indicators as
    | { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> }
    | undefined;
  const closes = (indicators?.quote?.[0]?.close ?? []).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const volumes = (indicators?.quote?.[0]?.volume ?? []).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const high52 = closes.length ? Math.max(...closes.slice(-252)) : null;
  const price3mAgo = closes.length >= 63 ? closes[closes.length - 63] : null;
  const avgVol20 =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;

  return {
    ticker: symbol,
    priceAbove200dSma: last != null && sma200 != null ? (last > sma200 ? 1 : 0) : null,
    priceAbove50dSma: last != null && sma50 != null ? (last > sma50 ? 1 : 0) : null,
    priceAbove20dSma: last != null && sma20 != null ? (last > sma20 ? 1 : 0) : null,
    rsi14: rsi(closes, 14),
    weeklyRsi: null,
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
    priceVsVwapPct: null,
    priceVs10EmaPct: null,
    priceVs20EmaPct: null,
    priceVs50EmaPct: null,
    daysUntilEarnings: null,
    atrPct14d: null,
    beta1y: null,
    avgDollarVolume20d:
      avgVol20 != null && last != null ? (avgVol20 * last) / 1_000_000 : null,
    sectorEtf1mChangePct: null,
    asOf: new Date().toISOString().slice(0, 10),
    source: "live",
  };
}

async function buildMarketContext(env: MarketEnv): Promise<Record<string, unknown>> {
  const cached = cacheGet(contextCache, "market");
  if (cached) return cached;

  const spyQuote = await resolveQuote("SPY", env);
  const chart = await fetchYahooChart("SPY", "1y", "1d");
  const tech = chart ? mapTechnicals("SPY", chart) : null;
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
    const cached = cacheGet(techCache, symbol);
    if (cached) return json({ technicals: cached, budgets: Object.values(budgets) });
    const chart = await fetchYahooChart(symbol);
    if (!chart) return json({ technicals: null, budgets: Object.values(budgets) }, 404);
    const technicals = mapTechnicals(symbol, chart);
    cacheSet(techCache, symbol, technicals, FUNDY_TTL_MS);
    return json({ technicals, budgets: Object.values(budgets) });
  }

  if (pathname === "/api/market/context" && request.method === "GET") {
    const context = await buildMarketContext(env);
    return json({ context, budgets: Object.values(budgets) });
  }

  return json({ error: "not found" }, 404);
}
