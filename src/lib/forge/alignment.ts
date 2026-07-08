import type { Bucket, Portfolio, StatusType, Strategy } from "../../types";
import { dataSource } from "../datasource";
import {
  aggregateConviction,
  scoreStock,
  type MetricContext,
  type StockAlignment,
  type WeightedAlignment,
} from "./scoring";
import { shouldScoreTickerWithStrategy } from "./tickerStrategy";

// ---------------------------------------------------------------------------
// Alignment bridge — ties the dataSource seam + buckets + the live strategy set
// to the pure scoring engine. AppState calls this; the engine itself stays
// I/O-free. A ticker can live in several buckets, so its HEADLINE alignment is
// the best-aligned slice; the portfolio number is the market-value-weighted
// blend across every scored allocation (bucket + applied-portfolio fallback).
// ---------------------------------------------------------------------------

export interface TickerAlignment {
  ticker: string;
  bucketId: string;
  bucketName: string;
  conviction: number;
  status: StatusType;
  alignment: StockAlignment;
}

export interface PortfolioAlignment {
  byTicker: Record<string, TickerAlignment>; // headline = best-aligned slice
  byBucket: Record<string, { conviction: number; status: StatusType }>;
  portfolio: { conviction: number; status: StatusType };
}

const EMPTY: PortfolioAlignment = {
  byTicker: {},
  byBucket: {},
  portfolio: { conviction: 0, status: "Watch" },
};

function coverageKey(strategyId: string, ticker: string): string {
  return `${strategyId}:${ticker}`;
}

function strategyAppliesToPortfolio(
  strategy: Strategy,
  portfolioId: string,
): boolean {
  return (strategy.appliedPortfolioIds ?? []).includes(portfolioId);
}

export function computePortfolioAlignment(
  portfolio: Portfolio | undefined,
  buckets: Bucket[],
  strategies: Strategy[],
): PortfolioAlignment {
  if (!portfolio) return EMPTY;

  const lastPrice = (ticker: string): number =>
    dataSource.getTickerInfo(ticker)?.lastPrice ?? 0;

  const bookValue = portfolio.holdings.reduce(
    (sum, holding) => sum + holding.shares * lastPrice(holding.ticker),
    0,
  );
  const holdingByTicker = new Map(
    portfolio.holdings.map((holding) => [holding.ticker, holding]),
  );
  const weightPctFor = (ticker: string): number => {
    const holding = holdingByTicker.get(ticker);
    if (!holding || bookValue <= 0) return 0;
    return (holding.shares * lastPrice(ticker) * 100) / bookValue;
  };

  const portfolioBuckets = buckets.filter(
    (bucket) => bucket.portfolioId === portfolio.id,
  );
  const market = dataSource.getMarketContext();

  const asOfMs = Date.parse(market.asOf);
  const holdingDaysFor = (entryDate?: string): number | undefined => {
    if (!entryDate || Number.isNaN(asOfMs)) return undefined;
    const entryMs = Date.parse(entryDate);
    if (Number.isNaN(entryMs)) return undefined;
    return Math.max(0, Math.round((asOfMs - entryMs) / 86_400_000));
  };

  const entryDateForTicker = (ticker: string): string | undefined => {
    for (const bucket of portfolioBuckets) {
      for (const allocation of bucket.holdings) {
        if (allocation.ticker === ticker && allocation.entryDate) {
          return allocation.entryDate;
        }
      }
    }
    return undefined;
  };

  const byTicker: Record<string, TickerAlignment> = {};
  const bucketSlices: Record<string, WeightedAlignment[]> = {};
  const coveredPairs = new Set<string>();

  function applyHeadline(
    ticker: string,
    sliceMeta: { bucketId: string; bucketName: string },
    conviction: number,
    status: StatusType,
    alignment: StockAlignment,
  ): void {
    const existing = byTicker[ticker];
    if (!existing || conviction > existing.conviction) {
      byTicker[ticker] = {
        ticker,
        bucketId: sliceMeta.bucketId,
        bucketName: sliceMeta.bucketName,
        conviction,
        status,
        alignment,
      };
    }
  }

  for (const bucket of portfolioBuckets) {
    const strategy = strategies.find((item) => item.id === bucket.strategyId);
    if (!strategy) continue;
    if (!strategyAppliesToPortfolio(strategy, portfolio.id)) continue;

    for (const allocation of bucket.holdings) {
      const ticker = allocation.ticker;
      const holding = holdingByTicker.get(ticker);
      if (!holding || !shouldScoreTickerWithStrategy(holding, strategy.id)) continue;

      coveredPairs.add(coverageKey(strategy.id, ticker));
      const ctx: MetricContext = {
        fundamentals: dataSource.getFundamentals(ticker),
        technicals: dataSource.getTechnicals(ticker),
        market,
        weightPct: weightPctFor(ticker),
        openPnlPct: holding?.openPnlPct,
        holdingDays: holdingDaysFor(allocation.entryDate),
      };

      const scored = scoreStock(strategy, ctx);
      const conviction = scored.hasRules
        ? scored.conviction
        : holding?.conviction ?? 0;
      const status: StatusType = scored.hasRules
        ? scored.status
        : holding?.status ?? "Watch";

      const marketValue = allocation.shares * lastPrice(ticker);
      const slice: WeightedAlignment = { conviction, marketValue };
      (bucketSlices[bucket.id] ??= []).push(slice);

      applyHeadline(
        ticker,
        { bucketId: bucket.id, bucketName: bucket.name },
        conviction,
        status,
        scored,
      );
    }
  }

  // Applied-portfolio fallback: score holdings when a strategy is applied but
  // no bucket allocation covers that (strategy, ticker) pair yet.
  for (const strategy of strategies) {
    if (!strategyAppliesToPortfolio(strategy, portfolio.id)) continue;

    for (const holding of portfolio.holdings) {
      if (holding.shares <= 0) continue;
      if (!shouldScoreTickerWithStrategy(holding, strategy.id)) continue;
      const ticker = holding.ticker;
      if (coveredPairs.has(coverageKey(strategy.id, ticker))) continue;

      const ctx: MetricContext = {
        fundamentals: dataSource.getFundamentals(ticker),
        technicals: dataSource.getTechnicals(ticker),
        market,
        weightPct: weightPctFor(ticker),
        openPnlPct: holding.openPnlPct,
        holdingDays: holdingDaysFor(entryDateForTicker(ticker)),
      };

      const scored = scoreStock(strategy, ctx);
      const conviction = scored.hasRules ? scored.conviction : holding.conviction;
      const status: StatusType = scored.hasRules ? scored.status : holding.status;

      applyHeadline(
        ticker,
        { bucketId: `applied-${strategy.id}`, bucketName: strategy.name },
        conviction,
        status,
        scored,
      );
      coveredPairs.add(coverageKey(strategy.id, ticker));
    }
  }

  const byBucket: Record<string, { conviction: number; status: StatusType }> = {};
  for (const [bucketId, slices] of Object.entries(bucketSlices)) {
    byBucket[bucketId] = aggregateConviction(slices);
  }

  // One market-value slice per ticker (headline conviction × full holding) so
  // multiple bucket/fallback passes never double-count the same shares.
  const portfolioHeadlineSlices: WeightedAlignment[] = portfolio.holdings
    .filter((holding) => holding.shares > 0 && byTicker[holding.ticker])
    .map((holding) => ({
      conviction: byTicker[holding.ticker].conviction,
      marketValue: holding.shares * lastPrice(holding.ticker),
    }));

  return {
    byTicker,
    byBucket,
    portfolio: aggregateConviction(portfolioHeadlineSlices),
  };
}
