/**
 * In-memory live market overlay filled by AppState refresh via Worker.
 * DataSource reads prefer this over mock seeds when present.
 */

import type {
  FundamentalSnapshot,
  MarketContext,
  TechnicalSnapshot,
  TickerQuote,
} from "../../types";

export type ProviderId = "yahoo" | "finnhub" | "fred" | "stooq";

export interface ProviderBudget {
  id: ProviderId;
  remaining: number;
  limit: number;
  resetAt: number;
}

const quotes = new Map<string, TickerQuote>();
const fundamentals = new Map<string, FundamentalSnapshot>();
const technicals = new Map<string, TechnicalSnapshot>();
let marketContext: MarketContext | null = null;
/** ISO timestamps keyed by strategy id — last successful portfolio refresh. */
const lastPullByStrategy = new Map<string, string>();
let budgets: ProviderBudget[] = [];
let generation = 0;
/** Search hits / session bootstrap for symbols not yet in TICKERS. */
const bootstrapNames = new Map<string, string>();

const listeners = new Set<() => void>();

function bump(): void {
  generation += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeLiveCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiveCacheGeneration(): number {
  return generation;
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

export function setLiveFundamentals(
  ticker: string,
  snapshot: FundamentalSnapshot,
): void {
  fundamentals.set(ticker.toUpperCase(), snapshot);
  bump();
}

export function getLiveFundamentals(
  ticker: string,
): FundamentalSnapshot | undefined {
  return fundamentals.get(ticker.toUpperCase());
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
