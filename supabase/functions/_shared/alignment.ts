import type {
  Bucket,
  CheckInterval,
  MarketContext,
  Portfolio,
  PortfolioTransaction,
  Strategy,
} from "../../../src/types.ts";
import { DEFAULT_BUCKETS } from "../../../src/data.ts";
import {
  evaluateZoneFlags,
  scoreStock,
  type MetricContext,
  type StockAlignment,
} from "../../../src/lib/forge/scoring.ts";
import { computeStrategyScopeAlignment } from "../../../src/lib/forge/strategyAlignmentAdapter.ts";
import { mergeStrategiesForScoring } from "../../../src/lib/forge/mergeStrategies.ts";
import { strategiesForHolding } from "../../../src/lib/forge/tickerStrategy.ts";
import { portfolioWeightPct } from "../../../src/lib/finance/portfolioWeight.ts";
import { resolveAggregatedStatus } from "../../../src/lib/forge/status.ts";

export interface CompleteMarketCycle {
  schemaVersion: 1;
  complete: true;
  cycleKey: string;
  cycleAsOf: string;
  quotes: Record<string, { lastPrice: number; asOf: string; source: string }>;
  fundamentals: Record<string, MetricContext["fundamentals"]>;
  technicals: Record<string, MetricContext["technicals"]>;
  byTimeframe: Record<string, MetricContext["technicalsByTimeframe"]>;
  context: MarketContext;
}

export interface Workspace {
  portfolios: Portfolio[];
  strategies: Strategy[];
  share_fills?: PortfolioTransaction[];
  buckets?: Bucket[];
}

export interface ScoredTickerResult {
  portfolio_id: string;
  ticker: string;
  conviction: number;
  status: string;
  resolved: StockAlignment["resolved"];
  payload: Record<string, unknown>;
}

export interface ScoredPortfolioSnapshot {
  portfolio_id: string;
  holdings_market_value: number;
  cost_basis: number;
  cash_available: number;
  total_value: number;
  open_pnl: number;
  open_pnl_pct: number;
  metrics: Record<string, unknown>;
}

export interface ScoredCheckEvent {
  portfolio_id: string;
  ticker: string;
  kind: "status" | "hold";
  primary_status: string | null;
  flags: string[];
  conviction: number | null;
}

export interface StrategyCheckOutput {
  results: ScoredTickerResult[];
  portfolioSnapshots: ScoredPortfolioSnapshot[];
  events: ScoredCheckEvent[];
}

export interface CombinedTickerResult extends ScoredTickerResult {
  strategy_ids: string[];
}

export interface AuthoritativeCheckOutput extends StrategyCheckOutput {
  combinedResults: CombinedTickerResult[];
  wholeBookSnapshots: ScoredPortfolioSnapshot[];
}

export interface CombinedAuthorityOutput {
  combinedResults: CombinedTickerResult[];
  wholeBookSnapshots: ScoredPortfolioSnapshot[];
}

function etDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function cashMetrics(
  ledger: PortfolioTransaction[],
  portfolioId: string,
  cycleAsOf: string,
): Record<string, unknown> {
  const day = etDate(cycleAsOf);
  let cashAdded = 0;
  let cashWithdrawn = 0;
  for (const row of ledger) {
    if (row.kind !== "cash" || row.portfolioId !== portfolioId) continue;
    if (etDate(row.filledAt) !== day) continue;
    if (row.deltaCash > 0) cashAdded += row.deltaCash;
    if (row.deltaCash < 0) cashWithdrawn -= row.deltaCash;
  }
  return {
    ...(cashAdded > 0 ? { cashAdded } : {}),
    ...(cashWithdrawn > 0 ? { cashWithdrawn } : {}),
  };
}

/**
 * Scores the claimed strategy independently, then recomputes every holding
 * affected by that run against its complete sorted strategy set. The latter is
 * the durable browser-headline contract: merge chips/weights, score once.
 */
export function scoreAuthoritativeCheck(
  workspace: Workspace,
  strategyId: string,
  cadence: CheckInterval,
  cycle: CompleteMarketCycle,
): AuthoritativeCheckOutput {
  const individual = scoreStrategyCheck(workspace, strategyId, cadence, cycle);
  const trigger = workspace.strategies.find((item) => item.id === strategyId);
  if (!trigger) throw new Error(`Strategy ${strategyId} is absent from user_state`);
  const combined = scoreCombinedAuthority(workspace, cycle);
  return {
    ...individual,
    combinedResults: combined.combinedResults.filter((result) =>
      result.strategy_ids.includes(strategyId)
    ),
    wholeBookSnapshots: combined.wholeBookSnapshots,
  };
}

/** Compute the complete merged book once; callers may reuse it across due runs. */
export function scoreCombinedAuthority(
  workspace: Workspace,
  cycle: CompleteMarketCycle,
): CombinedAuthorityOutput {
  const buckets = workspace.buckets ?? DEFAULT_BUCKETS;
  const ledger = workspace.share_fills ?? [];
  const combinedResults: CombinedTickerResult[] = [];
  const wholeBookSnapshots: ScoredPortfolioSnapshot[] = [];

  for (const portfolio of workspace.portfolios) {
    const priceOf = (ticker: string) =>
      cycle.quotes[ticker.toUpperCase()]?.lastPrice ?? 0;
    const portfolioBuckets = buckets.filter(
      (bucket) => bucket.portfolioId === portfolio.id,
    );
    const entryDateFor = (ticker: string) =>
      portfolioBuckets
        .flatMap((bucket) => bucket.holdings)
        .find((holding) => holding.ticker.toUpperCase() === ticker.toUpperCase())
        ?.entryDate;
    const slices: Array<{
      marketValue: number;
      conviction: number;
      categories: StockAlignment["categories"];
    }> = [];
    const zoneFlags: Array<"Go to Cash"> = [];

    for (const holding of portfolio.holdings) {
      const applicable = strategiesForHolding(
        holding,
        portfolio.id,
        workspace.strategies,
      );
      if (applicable.length === 0) continue;
      const ticker = holding.ticker.toUpperCase();
      const quote = cycle.quotes[ticker];
      if (!quote || !Number.isFinite(quote.lastPrice) || quote.lastPrice <= 0) {
        continue;
      }
      const entryDate = entryDateFor(ticker);
      const entryMs = entryDate ? Date.parse(entryDate) : NaN;
      const asOfMs = Date.parse(cycle.context.asOf);
      const context: MetricContext = {
        market: cycle.context,
        fundamentals: cycle.fundamentals[ticker],
        technicals: cycle.technicals[ticker],
        technicalsByTimeframe: cycle.byTimeframe[ticker],
        weightPct: portfolioWeightPct(portfolio.holdings, ticker, priceOf),
        openPnlPct:
          holding.avgPrice > 0
            ? ((quote.lastPrice - holding.avgPrice) / holding.avgPrice) * 100
            : undefined,
        holdingDays:
          Number.isNaN(entryMs) || Number.isNaN(asOfMs)
            ? undefined
            : Math.max(0, Math.round((asOfMs - entryMs) / 86_400_000)),
      };
      const scoringStrategy =
        applicable.length === 1
          ? applicable[0]!
          : mergeStrategiesForScoring(applicable);
      const scored = scoreStock(scoringStrategy, context, {
        hasStrategy: true,
        allowRuleOverlays: true,
      });
      const strategyIds = applicable.map((strategy) => strategy.id);
      const marketValue = holding.shares * quote.lastPrice;
      const costBasis = holding.shares * holding.avgPrice;
      combinedResults.push({
          portfolio_id: portfolio.id,
          ticker,
          strategy_ids: strategyIds,
          conviction: scored.conviction,
          status: scored.status,
          resolved: scored.resolved,
          payload: {
            portfolioId: portfolio.id,
            strategyIds,
            shares: holding.shares,
            avgPrice: holding.avgPrice,
            lastPrice: quote.lastPrice,
            marketValue,
            costBasis,
            openPnl: marketValue - costBasis,
            openPnlPct: context.openPnlPct,
            hasRules: scored.hasRules,
            categories: scored.categories,
            results: scored.results,
            zoneResults: scored.zoneResults,
            cycleKey: cycle.cycleKey,
          },
      });
      if (holding.shares > 0) {
        slices.push({
          marketValue,
          conviction: scored.conviction,
          categories: scored.categories,
        });
        if (evaluateZoneFlags(scoringStrategy, context).includes("Go to Cash")) {
          zoneFlags.push("Go to Cash");
        }
      }
    }

    const priced = portfolio.holdings.flatMap((holding) => {
      const quote = cycle.quotes[holding.ticker.toUpperCase()];
      return holding.shares > 0 && quote?.lastPrice > 0
        ? [{ holding, lastPrice: quote.lastPrice }]
        : [];
    });
    const cashAvailable = portfolio.cashAvailable ?? 0;
    if (priced.length === 0 && cashAvailable <= 0) continue;
    const holdingsMarketValue = priced.reduce(
      (sum, row) => sum + row.holding.shares * row.lastPrice,
      0,
    );
    const costBasis = priced.reduce(
      (sum, row) => sum + row.holding.shares * row.holding.avgPrice,
      0,
    );
    const openPnl = holdingsMarketValue - costBasis;
    const tracked = priced.filter(
      ({ holding }) =>
        strategiesForHolding(holding, portfolio.id, workspace.strategies).length > 0,
    );
    const trackedValue = tracked.reduce(
      (sum, row) => sum + row.holding.shares * row.lastPrice,
      0,
    );
    const trackedCost = tracked.reduce(
      (sum, row) => sum + row.holding.shares * row.holding.avgPrice,
      0,
    );
    const resolved = resolveAggregatedStatus(slices, {
      hasStrategy: slices.length > 0,
      zoneFlags,
      zoneSurface: "portfolio",
    });
    wholeBookSnapshots.push({
      portfolio_id: portfolio.id,
      holdings_market_value: holdingsMarketValue,
      cost_basis: costBasis,
      cash_available: cashAvailable,
      total_value: holdingsMarketValue + cashAvailable,
      open_pnl: openPnl,
      open_pnl_pct: costBasis > 0 ? (openPnl / costBasis) * 100 : 0,
      metrics: {
        ...cashMetrics(ledger, portfolio.id, cycle.cycleAsOf),
        ...(slices.length > 0
          ? { conviction: resolved.conviction }
          : {}),
        ...(trackedCost > 0
          ? { trackedOpenPnlPct: ((trackedValue - trackedCost) / trackedCost) * 100 }
          : {}),
      },
    });
  }

  return { combinedResults, wholeBookSnapshots };
}

function shouldScore(
  strategy: Strategy,
  portfolioId: string,
  holding: Portfolio["holdings"][number],
): boolean {
  if ((holding.strategyIds ?? []).includes(strategy.id)) return true;
  if (strategy.isDefault) return false;
  return !(strategy.tickerExclusions?.[portfolioId] ?? []).some(
    (ticker) => ticker.toUpperCase() === holding.ticker.toUpperCase(),
  );
}

/** Tickers the scorer will actually evaluate for this strategy (preflight must match). */
export function requiredTickersForStrategyCheck(
  workspace: Workspace,
  strategy: Strategy,
): string[] {
  const applied = new Set(strategy.appliedPortfolioIds ?? []);
  const tickers = new Set<string>();
  for (const portfolio of workspace.portfolios ?? []) {
    if (!applied.has(portfolio.id)) continue;
    for (const holding of portfolio.holdings) {
      if (shouldScore(strategy, portfolio.id, holding)) {
        tickers.add(holding.ticker.toUpperCase());
      }
    }
  }
  return [...tickers].sort();
}

function hadQuantityFill(
  ledger: PortfolioTransaction[],
  portfolioId: string,
  ticker: string,
  checkedAt: string,
  cadence: CheckInterval,
): boolean {
  const durations: Partial<Record<CheckInterval, number>> = {
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1D": 24 * 60 * 60_000,
    "1W": 7 * 24 * 60 * 60_000,
    "1M": 31 * 24 * 60 * 60_000,
  };
  const end = Date.parse(checkedAt);
  const start = end - (durations[cadence] ?? 24 * 60 * 60_000);
  return ledger.some(
    (event) =>
      event.kind !== "cash" &&
      event.portfolioId === portfolioId &&
      event.ticker.toUpperCase() === ticker &&
      Date.parse(event.filledAt) > start &&
      Date.parse(event.filledAt) <= end,
  );
}

export function scoreStrategyCheck(
  workspace: Workspace,
  strategyId: string,
  cadence: CheckInterval,
  cycle: CompleteMarketCycle,
): StrategyCheckOutput {
  const strategy = workspace.strategies.find((item) => item.id === strategyId);
  if (!strategy) {
    throw new Error(`Strategy ${strategyId} is absent from user_state`);
  }

  const applied = new Set(strategy.appliedPortfolioIds ?? []);
  const ledger = workspace.share_fills ?? [];
  const buckets = workspace.buckets ?? DEFAULT_BUCKETS;
  const results: ScoredTickerResult[] = [];
  const portfolioSnapshots: ScoredPortfolioSnapshot[] = [];
  const events: ScoredCheckEvent[] = [];

  for (const portfolio of workspace.portfolios) {
    if (!applied.has(portfolio.id)) continue;
    const scoped = portfolio.holdings.filter((holding) =>
      shouldScore(strategy, portfolio.id, holding),
    );
    const priced = scoped.flatMap((holding) => {
      const ticker = holding.ticker.toUpperCase();
      const quote = cycle.quotes[ticker];
      if (!quote || !Number.isFinite(quote.lastPrice) || quote.lastPrice <= 0) {
        return [];
      }
      return [{ holding, ticker, quote }];
    });
    const holdingsMarketValue = priced.reduce(
      (sum, row) => sum + row.holding.shares * row.quote.lastPrice,
      0,
    );
    const costBasis = priced.reduce(
      (sum, row) => sum + row.holding.shares * row.holding.avgPrice,
      0,
    );
    const cashAvailable = portfolio.cashAvailable ?? 0;
    const totalValue = holdingsMarketValue + cashAvailable;
    const openPnl = holdingsMarketValue - costBasis;
    const alignment = computeStrategyScopeAlignment({
      portfolio,
      strategy,
      buckets,
      marketInputs: {
        market: cycle.context,
        priceOf: (ticker) => cycle.quotes[ticker.toUpperCase()]?.lastPrice ?? 0,
        fundamentalsOf: (ticker) => cycle.fundamentals[ticker.toUpperCase()],
        technicalsOf: (ticker) => cycle.technicals[ticker.toUpperCase()],
        technicalsByTimeframeOf: (ticker) =>
          cycle.byTimeframe[ticker.toUpperCase()],
      },
      allowRuleOverlays: () => true,
      includeZeroShareFallback: true,
    });

    for (const [ticker, headline] of Object.entries(alignment.byTicker)) {
      const holding = portfolio.holdings.find(
        (item) => item.ticker.toUpperCase() === ticker,
      );
      const quote = cycle.quotes[ticker];
      if (
        !holding ||
        !quote ||
        !Number.isFinite(quote.lastPrice) ||
        quote.lastPrice <= 0
      ) {
        continue;
      }
      const marketValue = holding.shares * quote.lastPrice;
      const holdingCost = holding.shares * holding.avgPrice;
      const scored = headline.alignment;
      const result: ScoredTickerResult = {
        portfolio_id: portfolio.id,
        ticker,
        conviction: scored.conviction,
        status: scored.status,
        resolved: scored.resolved,
        payload: {
          portfolioId: portfolio.id,
          bucketId: headline.bucketId,
          bucketName: headline.bucketName,
          allocationShares: headline.allocationShares,
          entryDate: headline.entryDate,
          shares: holding.shares,
          avgPrice: holding.avgPrice,
          lastPrice: quote.lastPrice,
          marketValue,
          costBasis: holdingCost,
          openPnl: marketValue - holdingCost,
          openPnlPct:
            holding.avgPrice > 0
              ? ((quote.lastPrice - holding.avgPrice) / holding.avgPrice) * 100
              : undefined,
          hasRules: scored.hasRules,
          categories: scored.categories,
          results: scored.results,
          zoneResults: scored.zoneResults,
          cycleKey: cycle.cycleKey,
          cycleAsOf: cycle.cycleAsOf,
          checkEvaluations: (scored.zoneResults ?? []).map((zone) => ({
            metric: zone.chip?.metric ?? zone.chip?.id ?? null,
            timeframe: zone.chip?.timeframe ?? null,
            observedValue: zone.value ?? null,
            operator: zone.chip?.operator ?? null,
            threshold: zone.chip?.threshold ?? null,
            pass: zone.outcome === "pass",
            outcome: zone.outcome,
            cycleAsOf: cycle.cycleAsOf,
          })),
        },
      };
      results.push(result);
      events.push({
        portfolio_id: portfolio.id,
        ticker,
        kind: "status",
        primary_status: scored.resolved.primary,
        flags: scored.resolved.categoryFlags,
        conviction: scored.conviction,
      });
      if (
        !hadQuantityFill(
          ledger,
          portfolio.id,
          ticker,
          cycle.cycleAsOf,
          cadence,
        )
      ) {
        events.push({
          portfolio_id: portfolio.id,
          ticker,
          kind: "hold",
          primary_status: null,
          flags: [],
          conviction: scored.conviction,
        });
      }
    }

    if (holdingsMarketValue > 0 || cashAvailable > 0) {
      const weightedConviction = alignment.portfolio.conviction;
      portfolioSnapshots.push({
        portfolio_id: portfolio.id,
        holdings_market_value: holdingsMarketValue,
        cost_basis: costBasis,
        cash_available: cashAvailable,
        total_value: totalValue,
        open_pnl: openPnl,
        open_pnl_pct: costBasis > 0 ? (openPnl / costBasis) * 100 : 0,
        metrics: {
          ...cashMetrics(ledger, portfolio.id, cycle.cycleAsOf),
          ...(weightedConviction > 0
            ? { conviction: weightedConviction }
            : {}),
        },
      });
    }
  }

  return {
    results,
    portfolioSnapshots,
    events,
  };
}
