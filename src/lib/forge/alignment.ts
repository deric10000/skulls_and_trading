import type { Bucket, Portfolio, PortfolioHolding, ResolvedStatus, StatusType, Strategy } from "../../types";
import { dataSource } from "../datasource";
import {
  scoreStock,
  type MetricContext,
  type StockAlignment,
} from "./scoring";
import { mergeStrategiesForScoring } from "./mergeStrategies";
import {
  resolveAggregatedStatus,
  resolveStatus,
  type WeightedCategorySlice,
} from "./status";
import {
  shouldScoreTickerWithStrategy,
  strategiesForHolding,
  tickerHasAssignedStrategy,
} from "./tickerStrategy";

// ---------------------------------------------------------------------------
// Alignment bridge — ties the dataSource seam + buckets + the live strategy set
// to the pure scoring engine. AppState calls this; the engine itself stays
// I/O-free. A ticker can live in several buckets, so its HEADLINE alignment is
// the best-aligned slice; when multiple strategies apply to one ticker, the
// headline is recomputed from a merged virtual strategy (normalized chip +
// category weights — not a conviction average). Portfolio conviction is the
// market-value-weighted blend across every scored allocation.
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
  byTicker: Record<string, TickerAlignment>; // headline; merged when 2+ strategies apply
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
      if (!holding || !shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) continue;

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
      if (!shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) continue;
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

  function buildMetricContext(ticker: string, holding: PortfolioHolding): MetricContext {
    return {
      fundamentals: dataSource.getFundamentals(ticker),
      technicals: dataSource.getTechnicals(ticker),
      market,
      weightPct: weightPctFor(ticker),
      openPnlPct: holding.openPnlPct,
      holdingDays: holdingDaysFor(entryDateForTicker(ticker)),
    };
  }

  function scoreAlignmentForStrategies(
    applicable: Strategy[],
    ctx: MetricContext,
    hasStrategy: boolean,
  ): StockAlignment {
    const scored =
      applicable.length === 1
        ? scoreStock(applicable[0], ctx, { hasStrategy })
        : scoreStock(mergeStrategiesForScoring(applicable), ctx, { hasStrategy });
    const conviction = scored.hasRules ? scored.conviction : 0;
    const categories = scored.hasRules ? scored.categories : [];
    const resolved = scored.hasRules
      ? scored.resolved
      : resolveStatus(conviction, categories, { hasStrategy });
    return {
      ...scored,
      conviction,
      status: resolved.primary,
      resolved,
      categories,
    };
  }

  // Headline per ticker: one strategy scores as-is; multiple strategies merge
  // chip + category weights then score once (not max conviction across slices).
  for (const holding of portfolio.holdings) {
    if (holding.shares <= 0) continue;
    const ticker = holding.ticker;
    const applicable = strategiesForHolding(holding, portfolio.id, strategies);
    if (applicable.length === 0) continue;

    const ctx = buildMetricContext(ticker, holding);
    const alignment = scoreAlignmentForStrategies(applicable, ctx, true);
    const existing = byTicker[ticker];
    byTicker[ticker] = {
      ticker,
      bucketId:
        existing?.bucketId ??
        (applicable.length === 1
          ? `applied-${applicable[0].id}`
          : `merged-${applicable.map((strategy) => strategy.id).join("+")}`),
      bucketName:
        applicable.length > 1
          ? applicable.map((strategy) => strategy.name).join(" + ")
          : existing?.bucketName ?? applicable[0].name,
      conviction: alignment.conviction,
      status: alignment.status,
      resolved: alignment.resolved,
      alignment,
    };
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
