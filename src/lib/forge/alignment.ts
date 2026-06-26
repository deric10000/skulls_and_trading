import type { Bucket, Portfolio, StatusType, Strategy } from "../../types";
import { dataSource } from "../datasource";
import {
  aggregateConviction,
  scoreStock,
  type MetricContext,
  type StockAlignment,
  type WeightedAlignment,
} from "./scoring";

// ---------------------------------------------------------------------------
// Alignment bridge — ties the dataSource seam + buckets + the live strategy set
// to the pure scoring engine. AppState calls this; the engine itself stays
// I/O-free. A ticker can live in several buckets, so its HEADLINE alignment is
// the best-aligned bucket; the portfolio number is the market-value-weighted
// blend across every bucket allocation.
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
  byTicker: Record<string, TickerAlignment>; // headline = best-aligned bucket
  byBucket: Record<string, { conviction: number; status: StatusType }>;
  portfolio: { conviction: number; status: StatusType };
}

const EMPTY: PortfolioAlignment = {
  byTicker: {},
  byBucket: {},
  portfolio: { conviction: 0, status: "Watch" },
};

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

  const byTicker: Record<string, TickerAlignment> = {};
  const portfolioSlices: WeightedAlignment[] = [];
  const bucketSlices: Record<string, WeightedAlignment[]> = {};

  for (const bucket of portfolioBuckets) {
    const strategy = strategies.find((item) => item.id === bucket.strategyId);
    if (!strategy) continue;

    for (const allocation of bucket.holdings) {
      const ticker = allocation.ticker;
      const holding = holdingByTicker.get(ticker);
      const ctx: MetricContext = {
        fundamentals: dataSource.getFundamentals(ticker),
        technicals: dataSource.getTechnicals(ticker),
        market,
        weightPct: weightPctFor(ticker),
        openPnlPct: holding?.openPnlPct,
      };

      const scored = scoreStock(strategy, ctx);
      // Fall back to the holding's seed when a bucket's strategy isn't forged.
      const conviction = scored.hasRules
        ? scored.conviction
        : holding?.conviction ?? 0;
      const status: StatusType = scored.hasRules
        ? scored.status
        : holding?.status ?? "Watch";

      const marketValue = allocation.shares * lastPrice(ticker);
      const slice: WeightedAlignment = { conviction, marketValue };
      portfolioSlices.push(slice);
      (bucketSlices[bucket.id] ??= []).push(slice);

      // Headline per ticker = its best-aligned bucket (highest conviction).
      const existing = byTicker[ticker];
      if (!existing || conviction > existing.conviction) {
        byTicker[ticker] = {
          ticker,
          bucketId: bucket.id,
          bucketName: bucket.name,
          conviction,
          status,
          alignment: scored,
        };
      }
    }
  }

  const byBucket: Record<string, { conviction: number; status: StatusType }> = {};
  for (const [bucketId, slices] of Object.entries(bucketSlices)) {
    byBucket[bucketId] = aggregateConviction(slices);
  }

  return {
    byTicker,
    byBucket,
    portfolio: aggregateConviction(portfolioSlices),
  };
}
