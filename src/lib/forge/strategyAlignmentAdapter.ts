import type {
  Bucket,
  FundamentalSnapshot,
  MarketContext,
  Portfolio,
  StatusType,
  Strategy,
  TechnicalSnapshot,
  TimeframedIndicators,
  CandleInterval,
} from "../../types";
import { portfolioWeightPct } from "../finance/portfolioWeight";
import {
  evaluateZoneFlags,
  scoreStock,
  type MetricContext,
  type StockAlignment,
} from "./scoring";
import {
  resolveAggregatedStatus,
  resolveStatus,
  type WeightedCategorySlice,
} from "./status";
import { shouldScoreTickerWithStrategy } from "./tickerStrategy";

export interface StrategyScopeTickerAlignment {
  ticker: string;
  bucketId: string;
  bucketName: string;
  allocationShares?: number;
  entryDate?: string;
  alignment: StockAlignment;
}

export interface StrategyScopeAlignment {
  byTicker: Record<string, StrategyScopeTickerAlignment>;
  byBucket: Record<
    string,
    {
      conviction: number;
      status: StatusType;
      resolved: StockAlignment["resolved"];
    }
  >;
  portfolio: {
    conviction: number;
    status: StatusType;
    resolved: StockAlignment["resolved"];
  };
}

export interface StrategyScopeMarketInputs {
  market: MarketContext;
  priceOf: (ticker: string) => number;
  fundamentalsOf: (ticker: string) => FundamentalSnapshot | undefined;
  technicalsOf: (ticker: string) => TechnicalSnapshot | undefined;
  technicalsByTimeframeOf: (
    ticker: string,
  ) => Partial<Record<CandleInterval, TimeframedIndicators>> | undefined;
}

export interface ComputeStrategyScopeInput {
  portfolio: Portfolio;
  strategy: Strategy;
  buckets: Bucket[];
  marketInputs: StrategyScopeMarketInputs;
  allowRuleOverlays: (ticker: string) => boolean;
  /** Server-only: retain assigned watch names as completed/pending result rows. */
  includeZeroShareFallback?: boolean;
  onScore?: () => void;
}

function daysBetween(start: string | undefined, end: string): number | undefined {
  if (!start) return undefined;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return undefined;
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

export function computeStrategyScopeAlignment({
  portfolio,
  strategy,
  buckets,
  marketInputs,
  allowRuleOverlays,
  includeZeroShareFallback = false,
  onScore,
}: ComputeStrategyScopeInput): StrategyScopeAlignment {
  const holdingByTicker = new Map(
    portfolio.holdings.map((holding) => [holding.ticker.toUpperCase(), holding]),
  );
  const portfolioBuckets = buckets.filter(
    (bucket) => bucket.portfolioId === portfolio.id,
  );
  const strategyBuckets = portfolioBuckets.filter(
    (bucket) => bucket.strategyId === strategy.id,
  );
  const weightPctFor = (ticker: string) =>
    portfolioWeightPct(portfolio.holdings, ticker, marketInputs.priceOf);
  const entryDateForTicker = (ticker: string): string | undefined => {
    for (const bucket of portfolioBuckets) {
      const allocation = bucket.holdings.find(
        (item) => item.ticker.toUpperCase() === ticker.toUpperCase(),
      );
      if (allocation?.entryDate) return allocation.entryDate;
    }
    return undefined;
  };
  const metricContext = (
    ticker: string,
    entryDate?: string,
  ): MetricContext => {
    const holding = holdingByTicker.get(ticker.toUpperCase());
    const price = marketInputs.priceOf(ticker);
    return {
      fundamentals: marketInputs.fundamentalsOf(ticker),
      technicals: marketInputs.technicalsOf(ticker),
      technicalsByTimeframe:
        marketInputs.technicalsByTimeframeOf(ticker),
      market: marketInputs.market,
      weightPct: weightPctFor(ticker),
      openPnlPct:
        holding && holding.avgPrice > 0 && price > 0
          ? ((price - holding.avgPrice) / holding.avgPrice) * 100
          : undefined,
      holdingDays: daysBetween(entryDate, marketInputs.market.asOf),
    };
  };

  const byTicker: StrategyScopeAlignment["byTicker"] = {};
  const bucketSlices: Record<string, WeightedCategorySlice[]> = {};
  const covered = new Set<string>();

  const scoreContext = (
    ticker: string,
    context: MetricContext,
    noRulesConviction?: number,
  ): StockAlignment => {
    const holding = holdingByTicker.get(ticker.toUpperCase());
    const overlays = allowRuleOverlays(ticker);
    onScore?.();
    const scored = scoreStock(strategy, context, {
      hasStrategy: true,
      allowRuleOverlays: overlays,
    });
    const conviction = scored.hasRules
      ? scored.conviction
      : noRulesConviction ?? holding?.conviction ?? 0;
    const categories = scored.hasRules ? scored.categories : [];
    const resolved = scored.hasRules
      ? scored.resolved
      : resolveStatus(conviction, categories, {
          hasStrategy: true,
          allowRuleOverlays: overlays,
        });
    return {
      ...scored,
      conviction,
      status: resolved.primary,
      resolved,
      categories,
    };
  };

  const scoreSlice = (
    ticker: string,
    bucketId: string,
    bucketName: string,
    context: MetricContext,
    marketValue: number,
    allocationShares?: number,
    entryDate?: string,
  ) => {
    const alignment = scoreContext(ticker, context);
    const key = ticker.toUpperCase();
    const existing = byTicker[key];
    if (!existing || alignment.conviction > existing.alignment.conviction) {
      byTicker[key] = {
        ticker: key,
        bucketId,
        bucketName,
        allocationShares,
        entryDate,
        alignment,
      };
    }
    if (marketValue > 0 && !bucketId.startsWith("applied-")) {
      (bucketSlices[bucketId] ??= []).push({
        marketValue,
        conviction: alignment.conviction,
        categories: alignment.categories,
      });
    }
  };

  for (const bucket of strategyBuckets) {
    for (const allocation of bucket.holdings) {
      const ticker = allocation.ticker.toUpperCase();
      const holding = holdingByTicker.get(ticker);
      if (
        !holding ||
        !shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)
      ) {
        continue;
      }
      covered.add(ticker);
      scoreSlice(
        ticker,
        bucket.id,
        bucket.name,
        metricContext(ticker, allocation.entryDate),
        allocation.shares * marketInputs.priceOf(ticker),
        allocation.shares,
        allocation.entryDate,
      );
    }
  }

  for (const holding of portfolio.holdings) {
    if (holding.shares <= 0 && !includeZeroShareFallback) continue;
    const ticker = holding.ticker.toUpperCase();
    if (covered.has(ticker)) continue;
    if (!shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) continue;
    scoreSlice(
      ticker,
      `applied-${strategy.id}`,
      strategy.name,
      metricContext(ticker, entryDateForTicker(ticker)),
      0,
    );
  }

  // Preserve the pre-refactor browser contract: bucket slices feed byBucket,
  // then every positive holding is rescored once with its full-holding context
  // and the first portfolio-bucket entry date. This overwrite is intentional.
  for (const holding of portfolio.holdings) {
    if (holding.shares <= 0) continue;
    if (!shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) continue;
    const ticker = holding.ticker.toUpperCase();
    const existing = byTicker[ticker];
    const entryDate = entryDateForTicker(ticker);
    byTicker[ticker] = {
      ticker,
      bucketId: existing?.bucketId ?? `applied-${strategy.id}`,
      bucketName: existing?.bucketName ?? strategy.name,
      allocationShares: holding.shares,
      entryDate,
      alignment: scoreContext(ticker, metricContext(ticker, entryDate), 0),
    };
  }

  const portfolioHasStrategy = portfolio.holdings.some((holding) =>
    shouldScoreTickerWithStrategy(holding, strategy, portfolio.id),
  );
  const byBucket: StrategyScopeAlignment["byBucket"] = {};
  for (const [bucketId, slices] of Object.entries(bucketSlices)) {
    const resolved = resolveAggregatedStatus(slices, {
      hasStrategy: portfolioHasStrategy,
    });
    byBucket[bucketId] = {
      conviction: resolved.conviction,
      status: resolved.primary,
      resolved,
    };
  }

  const portfolioSlices: WeightedCategorySlice[] = portfolio.holdings
    .filter((holding) => holding.shares > 0 && byTicker[holding.ticker.toUpperCase()])
    .map((holding) => {
      const headline = byTicker[holding.ticker.toUpperCase()]!;
      return {
        conviction: headline.alignment.conviction,
        marketValue:
          holding.shares * marketInputs.priceOf(holding.ticker),
        categories: headline.alignment.categories,
      };
    });
  const portfolioZoneFlags: StatusType[] = [];
  for (const holding of portfolio.holdings) {
    if (holding.shares <= 0) continue;
    if (!shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) continue;
    if (!allowRuleOverlays(holding.ticker)) continue;
    const flags = evaluateZoneFlags(
      strategy,
      metricContext(holding.ticker, entryDateForTicker(holding.ticker)),
    );
    if (flags.includes("Go to Cash")) {
      portfolioZoneFlags.push("Go to Cash");
      break;
    }
  }
  const portfolioResolved = resolveAggregatedStatus(portfolioSlices, {
    hasStrategy: portfolioHasStrategy,
    zoneFlags: portfolioZoneFlags,
    zoneSurface: "portfolio",
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
