import type { Bucket, Portfolio, ResolvedStatus, StatusType, Strategy } from "../../types";
import { dataSource } from "../datasource";
import {
  scoreStock,
  type MetricContext,
  type StockAlignment,
} from "./scoring";
import {
  resolveAggregatedStatus,
  resolveStatus,
  type WeightedCategorySlice,
} from "./status";
import { shouldScoreTickerWithStrategy, tickerHasAssignedStrategy } from "./tickerStrategy";

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
  resolved: ResolvedStatus;
  alignment: StockAlignment;
}

export interface PortfolioAlignment {
  byTicker: Record<string, TickerAlignment>; // headline = best-aligned slice
  byBucket: Record<
    string,
    { conviction: number; status: StatusType; resolved: ResolvedStatus }
  >;
  portfolio: { conviction: number; status: StatusType; resolved: ResolvedStatus };
}

const EMPTY: PortfolioAlignment = {
  byTicker: {},
  byBucket: {},
  portfolio: {
    conviction: 0,
    status: "Watch",
    resolved: resolveStatus(0, [], { hasStrategy: false }),
  },
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
  const bucketSlices: Record<string, WeightedCategorySlice[]> = {};
  const coveredPairs = new Set<string>();

  function applyHeadline(
    ticker: string,
    sliceMeta: { bucketId: string; bucketName: string },
    alignment: StockAlignment,
  ): void {
    const { conviction, status, resolved } = alignment;
    const existing = byTicker[ticker];
    if (!existing || conviction > existing.conviction) {
      byTicker[ticker] = {
        ticker,
        bucketId: sliceMeta.bucketId,
        bucketName: sliceMeta.bucketName,
        conviction,
        status,
        resolved,
        alignment,
      };
    }
  }

  function scoreTickerSlice(
    ticker: string,
    strategy: Strategy,
    ctx: MetricContext,
    sliceMeta: { bucketId: string; bucketName: string },
    marketValue: number,
    bucketId?: string,
  ): void {
    const holding = holdingByTicker.get(ticker);
    const hasStrategy = tickerHasAssignedStrategy(ticker, portfolio, strategies);
    const scored = scoreStock(strategy, ctx, { hasStrategy });
    const conviction = scored.hasRules ? scored.conviction : holding?.conviction ?? 0;
    const categories = scored.hasRules ? scored.categories : [];
    const resolved = scored.hasRules
      ? scored.resolved
      : resolveStatus(conviction, categories, { hasStrategy });
    const alignment: StockAlignment = {
      ...scored,
      conviction,
      status: resolved.primary,
      resolved,
      categories,
    };

    if (bucketId && marketValue > 0) {
      (bucketSlices[bucketId] ??= []).push({
        marketValue,
        conviction: alignment.conviction,
        categories: alignment.categories,
      });
    }

    applyHeadline(ticker, sliceMeta, alignment);
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
        openPnlPct: holding.openPnlPct,
        holdingDays: holdingDaysFor(allocation.entryDate),
      };

      scoreTickerSlice(
        ticker,
        strategy,
        ctx,
        { bucketId: bucket.id, bucketName: bucket.name },
        allocation.shares * lastPrice(ticker),
        bucket.id,
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

      scoreTickerSlice(
        ticker,
        strategy,
        ctx,
        { bucketId: `applied-${strategy.id}`, bucketName: strategy.name },
        0,
      );
      coveredPairs.add(coverageKey(strategy.id, ticker));
    }
  }

  const portfolioHasStrategy = portfolio.holdings.some((holding) =>
    tickerHasAssignedStrategy(holding.ticker, portfolio, strategies),
  );

  const byBucket: PortfolioAlignment["byBucket"] = {};
  for (const [bucketId, slices] of Object.entries(bucketSlices)) {
    const resolved = resolveAggregatedStatus(slices, { hasStrategy: portfolioHasStrategy });
    byBucket[bucketId] = {
      conviction: resolved.conviction,
      status: resolved.primary,
      resolved,
    };
  }

  const portfolioHeadlineSlices: WeightedCategorySlice[] = portfolio.holdings
    .filter((holding) => holding.shares > 0 && byTicker[holding.ticker])
    .map((holding) => ({
      conviction: byTicker[holding.ticker].conviction,
      marketValue: holding.shares * lastPrice(holding.ticker),
      categories: byTicker[holding.ticker].alignment.categories,
    }));

  const portfolioResolved = resolveAggregatedStatus(portfolioHeadlineSlices, {
    hasStrategy: portfolioHasStrategy,
  });

  return {
    byTicker,
    byBucket,
    portfolio: {
      conviction: portfolioResolved.conviction,
      status: portfolioResolved.primary,
      resolved: portfolioResolved,
    },
  };
}
