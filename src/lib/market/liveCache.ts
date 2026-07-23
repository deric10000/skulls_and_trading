/**
 * In-memory live market overlay filled by AppState refresh via Worker.
 * DataSource reads prefer this over mock seeds when present.
 */

import type {
  CandleInterval,
  FundamentalSnapshot,
  MarketContext,
  TechnicalSnapshot,
  TickerQuote,
  TimeframedIndicators,
} from "../../types";
import type { MarketCyclePayload } from "./client";
import { sanitizeFundamentals } from "../forge/metricSanity";
import { mapYahooTaxonomy } from "../weather/yahooTaxonomy";
import { reportTaxonomyGap } from "../userStore/taxonomyGaps";

export type ProviderId = "yahoo" | "finnhub" | "fred" | "stooq";

export interface ProviderBudget {
  id: ProviderId;
  remaining: number;
  limit: number;
  resetAt: number;
}

/** Live GICS mapping for a ticker (from Yahoo assetProfile → yahooTaxonomy). */
export interface LiveTickerTaxonomy {
  sector: string | null;
  industry: string | null;
  providerSector: string | null;
  providerIndustry: string | null;
}

const quotes = new Map<string, TickerQuote>();
const fundamentals = new Map<string, FundamentalSnapshot>();
const taxonomyByTicker = new Map<string, LiveTickerTaxonomy>();
const technicals = new Map<string, TechnicalSnapshot>();
const technicalsByTimeframe = new Map<
  string,
  Partial<Record<CandleInterval, TimeframedIndicators>>
>();
let marketContext: MarketContext | null = null;
let marketCycle: Pick<
  MarketCyclePayload,
  "cycleAsOf" | "completedAt" | "publishedAt" | "nextCycleAt"
> | null = null;
/** ISO timestamps keyed by strategy id — last successful portfolio refresh. */
const lastPullByStrategy = new Map<string, string>();
/** Strategy body/apply changed — scores wait for a check at/after this time. */
const strategyDirtyAt = new Map<string, number>();
/** Ticker added/enabled — waits for a check at/after this time. */
const tickerDirtyAt = new Map<string, number>();
let budgets: ProviderBudget[] = [];
let generation = 0;
/** Search hits / session bootstrap for symbols not yet in TICKERS. */
const bootstrapNames = new Map<string, string>();

const listeners = new Set<() => void>();

function bump(): void {
  generation += 1;
  listeners.forEach((listener) => listener());
}

function ingestTaxonomyFromFundamentals(
  ticker: string,
  snapshot: FundamentalSnapshot,
): void {
  const mapped = mapYahooTaxonomy(
    snapshot.providerSector,
    snapshot.providerIndustry,
  );
  const key = ticker.toUpperCase();
  taxonomyByTicker.set(key, {
    sector: mapped.sector,
    industry: mapped.industry,
    providerSector: mapped.providerSector,
    providerIndustry: mapped.providerIndustry,
  });
  if (mapped.gapReason) {
    void reportTaxonomyGap({
      ticker: key,
      reason: mapped.gapReason,
      yahooSector: mapped.providerSector,
      yahooIndustry: mapped.providerIndustry,
    });
  }
}

export function subscribeLiveCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiveCacheGeneration(): number {
  return generation;
}

/** Clear account-scoped market state before account switches/hydration. */
export function resetLiveCache(): void {
  quotes.clear();
  fundamentals.clear();
  taxonomyByTicker.clear();
  technicals.clear();
  technicalsByTimeframe.clear();
  lastPullByStrategy.clear();
  strategyDirtyAt.clear();
  tickerDirtyAt.clear();
  marketContext = null;
  marketCycle = null;
  budgets = [];
  bump();
}

/** Commit a completed Worker cycle in one generation so UI never half-paints. */
export function applyMarketCycle(cycle: MarketCyclePayload): void {
  for (const [ticker, quote] of Object.entries(cycle.quotes)) {
    quotes.set(ticker.toUpperCase(), { ...quote, source: "live" });
  }
  for (const [ticker, snapshot] of Object.entries(cycle.fundamentals)) {
    const clean = sanitizeFundamentals(snapshot);
    fundamentals.set(ticker.toUpperCase(), clean);
    ingestTaxonomyFromFundamentals(ticker, clean);
  }
  for (const [ticker, snapshot] of Object.entries(cycle.technicals)) {
    technicals.set(ticker.toUpperCase(), snapshot);
  }
  for (const [ticker, snapshots] of Object.entries(cycle.byTimeframe)) {
    technicalsByTimeframe.set(ticker.toUpperCase(), snapshots);
  }
  if (cycle.context) marketContext = cycle.context;
  marketCycle = {
    cycleAsOf: cycle.cycleAsOf,
    completedAt: cycle.completedAt,
    publishedAt: cycle.publishedAt,
    nextCycleAt: cycle.nextCycleAt,
  };
  bump();
}

export function getMarketCycleMeta(): typeof marketCycle {
  return marketCycle;
}

export function setLiveQuotes(next: Record<string, TickerQuote>): void {
  for (const [ticker, quote] of Object.entries(next)) {
    quotes.set(ticker.toUpperCase(), { ...quote, source: "live" });
  }
  bump();
}

export function getLiveQuote(ticker: string): TickerQuote | undefined {
  return quotes.get(ticker.toUpperCase());
}

/** True when a live mark exists with a real positive last price (not a zero stub). */
export function hasUsableLiveQuote(ticker: string): boolean {
  const quote = getLiveQuote(ticker);
  return Boolean(
    quote && Number.isFinite(quote.lastPrice) && quote.lastPrice > 0,
  );
}

export function setLiveFundamentals(
  ticker: string,
  snapshot: FundamentalSnapshot,
): void {
  const clean = sanitizeFundamentals(snapshot);
  fundamentals.set(ticker.toUpperCase(), clean);
  ingestTaxonomyFromFundamentals(ticker, clean);
  bump();
}

export function getLiveFundamentals(
  ticker: string,
): FundamentalSnapshot | undefined {
  return fundamentals.get(ticker.toUpperCase());
}

export function getLiveTaxonomy(ticker: string): LiveTickerTaxonomy | undefined {
  return taxonomyByTicker.get(ticker.toUpperCase());
}

export function setLiveTechnicals(
  ticker: string,
  snapshot: TechnicalSnapshot,
): void {
  technicals.set(ticker.toUpperCase(), snapshot);
  bump();
}

export function getLiveTechnicals(
  ticker: string,
): TechnicalSnapshot | undefined {
  return technicals.get(ticker.toUpperCase());
}

export function setLiveTechnicalsByTimeframe(
  ticker: string,
  byTimeframe: Partial<Record<CandleInterval, TimeframedIndicators>>,
): void {
  const key = ticker.toUpperCase();
  const prev = technicalsByTimeframe.get(key) ?? {};
  technicalsByTimeframe.set(key, { ...prev, ...byTimeframe });
  bump();
}

export function getLiveTechnicalsByTimeframe(
  ticker: string,
): Partial<Record<CandleInterval, TimeframedIndicators>> | undefined {
  return technicalsByTimeframe.get(ticker.toUpperCase());
}

export function setLiveMarketContext(context: MarketContext): void {
  marketContext = context;
  bump();
}

export function getLiveMarketContext(): MarketContext | undefined {
  return marketContext ?? undefined;
}

export function setLastDataPullAt(strategyId: string, iso: string): void {
  lastPullByStrategy.set(strategyId, iso);
  bump();
}

export function getLastDataPullAt(strategyId: string): string | undefined {
  return lastPullByStrategy.get(strategyId);
}

export function getLastDataPullAtMap(): Record<string, string> {
  return Object.fromEntries(lastPullByStrategy.entries());
}

function tickerDirtyKey(portfolioId: string, ticker: string): string {
  return `${portfolioId}:${ticker.trim().toUpperCase()}`;
}

/** Strategy edited or (re)applied — hide scores until the next successful check. */
export function markStrategyConvictionDirty(strategyId: string): void {
  strategyDirtyAt.set(strategyId, Date.now());
  bump();
}

/** Ticker added or newly enabled on a strategy — wait for the next check. */
export function markTickerConvictionDirty(
  portfolioId: string,
  ticker: string,
): void {
  tickerDirtyAt.set(tickerDirtyKey(portfolioId, ticker), Date.now());
  bump();
}

/** Restore persisted dirty stamps after hydrate (ISO → epoch ms). */
export function hydrateTickerConvictionDirty(
  stamps: Record<string, string> | undefined,
): void {
  tickerDirtyAt.clear();
  for (const [key, iso] of Object.entries(stamps ?? {})) {
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) tickerDirtyAt.set(key, ms);
  }
  bump();
}

/** Persistable map of dirty keys → ISO timestamps. */
export function getTickerConvictionDirtyMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, ms] of tickerDirtyAt.entries()) {
    out[key] = new Date(ms).toISOString();
  }
  return out;
}

/** A real scoped check completed for this strategy body. */
export function clearStrategyConvictionDirty(strategyId: string): void {
  strategyDirtyAt.delete(strategyId);
  bump();
}

/** A real check included this ticker in this portfolio. */
export function clearTickerConvictionDirty(
  portfolioId: string,
  ticker: string,
): void {
  tickerDirtyAt.delete(tickerDirtyKey(portfolioId, ticker));
  bump();
}

/**
 * True when displayed conviction may show for this ticker. False → No Score
 * (no completed check yet, or add/apply/update is newer than the last check,
 * or a published cycle is incomplete for thesis/risk inputs).
 */
export function isConvictionScoreReady(
  portfolioId: string,
  ticker: string,
  strategyIds: string[],
): boolean {
  if (strategyIds.length === 0) return true;
  const tickerDirty = tickerDirtyAt.get(tickerDirtyKey(portfolioId, ticker));
  for (const strategyId of strategyIds) {
    const last = lastPullByStrategy.get(strategyId);
    if (!last) return false;
    const lastMs = Date.parse(last);
    if (Number.isNaN(lastMs)) return false;
    const dirty = strategyDirtyAt.get(strategyId);
    if (dirty != null && lastMs < dirty) return false;
    if (tickerDirty != null && lastMs < tickerDirty) return false;
  }
  // Incomplete published cycle: missing context or ticker fundamentals →
  // Score Pending (do not silently renormalize over technicals-only).
  if (marketCycle) {
    if (!marketContext) return false;
    if (!fundamentals.has(ticker.toUpperCase())) return false;
  }
  return true;
}

export function setProviderBudgets(next: ProviderBudget[]): void {
  budgets = next;
  bump();
}

export function getProviderBudgets(): ProviderBudget[] {
  return budgets;
}

export function registerBootstrapTickers(
  hits: { symbol: string; name: string }[],
): void {
  for (const hit of hits) {
    const symbol = hit.symbol.trim().toUpperCase();
    if (!symbol) continue;
    bootstrapNames.set(symbol, hit.name.trim() || symbol);
  }
}

export function getBootstrapName(ticker: string): string | undefined {
  return bootstrapNames.get(ticker.trim().toUpperCase());
}
