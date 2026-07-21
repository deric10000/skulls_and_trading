/**
 * Cron-cycle reader — registers a user's symbols and atomically fills liveCache
 * from the latest completed Worker cycle. It never calls upstream providers.
 */

import type { Portfolio, Strategy, TickerQuote } from "../../types";
import {
  fetchMarketFundamentals,
  fetchMarketQuotes,
  fetchMarketTechnicals,
  fetchLatestMarketCycle,
  registerMarketSymbols,
} from "./client";
import {
  applyMarketCycle,
  clearStrategyConvictionDirty,
  clearTickerConvictionDirty,
  getLiveQuote,
  getMarketCycleMeta,
  setLiveFundamentals,
  setLiveQuotes,
  setLiveTechnicals,
  setLiveTechnicalsByTimeframe,
  setLastDataPullAt,
} from "./liveCache";
import {
  checkBoundaryForCycle,
  tickersForStrategy,
} from "../forge/scheduler";
import { neededTimeframesForStrategies } from "./neededTimeframes";

export async function registerPortfolioMarketSymbols(
  tickers: string[],
): Promise<boolean> {
  return registerMarketSymbols(tickers);
}

export async function readLatestMarketCycle(
  tickers: string[],
  appliedStrategies: Strategy[],
  requiredCycleAt?: string,
): Promise<string | null> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return null;
  const cycle = await fetchLatestMarketCycle();
  if (!cycle) return null;
  if (
    requiredCycleAt &&
    Date.parse(cycle.cycleAsOf) < Date.parse(requiredCycleAt)
  ) {
    return null;
  }
  const complete = unique.every(
    (ticker) =>
      cycle.quotes[ticker] &&
      cycle.technicals[ticker] &&
      cycle.byTimeframe[ticker]?.["1h"],
  );
  if (!complete) return null;
  const current = getMarketCycleMeta();
  if (current?.cycleAsOf !== cycle.cycleAsOf) applyMarketCycle(cycle);
  for (const strategy of appliedStrategies) {
    setLastDataPullAt(
      strategy.id,
      checkBoundaryForCycle(strategy, cycle.cycleAsOf),
    );
  }
  return cycle.cycleAsOf;
}

export interface ImmediateStrategyCheckResult {
  checkedAt: string;
  tickers: string[];
  quotes: Record<string, TickerQuote>;
  source: "cycle" | "scoped";
}

function clearCheckedDirtyState(
  strategy: Strategy,
  portfolios: Portfolio[],
  tickers: string[],
): void {
  clearStrategyConvictionDirty(strategy.id);
  const checked = new Set(tickers);
  for (const portfolio of portfolios) {
    if (!(strategy.appliedPortfolioIds ?? []).includes(portfolio.id)) continue;
    for (const holding of portfolio.holdings) {
      if (checked.has(holding.ticker.toUpperCase())) {
        clearTickerConvictionDirty(portfolio.id, holding.ticker);
      }
    }
  }
}

/**
 * First-value check for apply/update/Preview. Prefer the completed cron cycle;
 * if it cannot cover this strategy, pull only this strategy's small universe.
 */
export async function runImmediateStrategyCheck(
  strategy: Strategy,
  portfolios: Portfolio[],
): Promise<ImmediateStrategyCheckResult | null> {
  const tickers = tickersForStrategy(strategy, portfolios);
  if (tickers.length === 0) return null;
  await registerMarketSymbols(tickers);

  const cycleAsOf = await readLatestMarketCycle(tickers, [strategy]);
  if (cycleAsOf) {
    const quotes = Object.fromEntries(
      tickers.flatMap((ticker) => {
        const quote = getLiveQuote(ticker);
        return quote ? [[ticker, quote] as const] : [];
      }),
    );
    clearCheckedDirtyState(strategy, portfolios, tickers);
    return { checkedAt: cycleAsOf, tickers, quotes, source: "cycle" };
  }

  const quoteResult = await fetchMarketQuotes(tickers);
  if (!quoteResult) return null;
  setLiveQuotes(quoteResult.quotes);
  const timeframes = neededTimeframesForStrategies([strategy]);
  const snapshots = await Promise.all(
    tickers.map(async (ticker) => {
      const [fundamentals, technicals] = await Promise.all([
        fetchMarketFundamentals(ticker),
        fetchMarketTechnicals(ticker, { timeframes }),
      ]);
      return { ticker, fundamentals, technicals };
    }),
  );
  for (const snapshot of snapshots) {
    if (snapshot.fundamentals?.fundamentals) {
      setLiveFundamentals(snapshot.ticker, snapshot.fundamentals.fundamentals);
    }
    if (snapshot.technicals?.technicals) {
      setLiveTechnicals(snapshot.ticker, snapshot.technicals.technicals);
    }
    if (snapshot.technicals?.byTimeframe) {
      setLiveTechnicalsByTimeframe(
        snapshot.ticker,
        snapshot.technicals.byTimeframe,
      );
    }
  }

  const complete = tickers.every(
    (ticker) =>
      quoteResult.quotes[ticker] &&
      snapshots.some(
        (snapshot) =>
          snapshot.ticker === ticker && snapshot.technicals?.technicals,
      ),
  );
  if (!complete) return null;

  const quoteTimes = Object.values(quoteResult.quotes)
    .map((quote) => Date.parse(quote.asOf))
    .filter(Number.isFinite);
  const dataAsOf =
    quoteTimes.length > 0
      ? new Date(Math.min(...quoteTimes)).toISOString()
      : new Date().toISOString();
  const checkedAt = checkBoundaryForCycle(strategy, dataAsOf);
  setLastDataPullAt(strategy.id, checkedAt);
  clearCheckedDirtyState(strategy, portfolios, tickers);
  return {
    checkedAt,
    tickers,
    quotes: quoteResult.quotes,
    source: "scoped",
  };
}

/** Format an ISO check boundary in ET. */
export function formatPullStamp(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Already a date-only string?
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}
