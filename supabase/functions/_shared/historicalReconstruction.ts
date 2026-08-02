import type {
  Portfolio,
  PortfolioHolding,
  StatusType,
  Strategy,
} from "../../../src/types.ts";
import {
  requiredTickersForStrategyCheck,
  scoreCombinedAuthority,
  type CompleteMarketCycle,
} from "./alignment.ts";

export const HISTORICAL_CHUNK_SIZE = 20;

export interface HistoricalWorkingPortfolio extends Portfolio {
  historicalReplayReliable?: boolean;
}

export interface HistoricalJob {
  id: string;
  user_id: string;
  import_batch_id: string | null;
  portfolio_id: string;
  score_window_start: string;
  score_window_end: string;
  working_portfolio: HistoricalWorkingPortfolio;
  cursor_filled_at: string | null;
  cursor_transaction_id: string | null;
}

export interface HistoricalTransactionRow {
  id: string;
  portfolio_id: string;
  kind: "qty" | "cash";
  transaction_type: "buy" | "sell" | "deposit" | "withdrawal";
  ticker: string | null;
  quantity: number | string | null;
  fill_price: number | string | null;
  filled_at: string;
  shares_before: number | string | null;
  shares_after: number | string | null;
  cash_before: number | string | null;
  cash_after: number | string | null;
  /** Durable import flag: sell closed shares never accounted in this book. */
  untracked_close?: boolean | null;
}

export interface HistoricalStrategyVersionRow {
  id: string;
  strategy_id: string;
  effective_from: string;
  effective_to: string | null;
  snapshot: Strategy;
}

export interface HistoricalStrategyEpisodeRow {
  strategy_id: string;
  portfolio_id: string;
  applied_at: string;
  removed_at: string | null;
}

export interface HistoricalTickerEpisodeRow {
  strategy_id: string;
  portfolio_id: string;
  ticker: string;
  applied_at: string;
  removed_at: string | null;
}

export interface HistoricalResult {
  transactionId: string;
  status: "scored" | "unscored" | "incomplete" | "skipped";
  reason?: string;
  cycleKey?: string;
  cycleAsOf?: string;
  strategyIds: string[];
  strategyVersionIds: string[];
  zoneHints: StatusType[];
  alignment: Array<{
    strategyIds: string[];
    conviction: number;
    primary: string | null;
    flags: string[];
  }>;
}

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function replayStateMatches(
  portfolio: Portfolio,
  transaction: HistoricalTransactionRow,
): boolean {
  const cashMatches =
    Math.abs(
      (portfolio.cashAvailable ?? 0) - numberValue(transaction.cash_before),
    ) < 0.005;
  if (transaction.kind === "cash") return cashMatches;
  const shares = portfolio.holdings.find(
    (holding) => holding.ticker === transaction.ticker,
  )?.shares ?? 0;
  const sharesBefore = numberValue(transaction.shares_before);
  if (
    transaction.untracked_close === true &&
    transaction.transaction_type === "sell" &&
    sharesBefore > shares &&
    shares >= 0
  ) {
    // Intentional brokerage close from a zero/under-accounted holding.
    return cashMatches;
  }
  return cashMatches && Math.abs(shares - sharesBefore) < 0.0000005;
}

function activeAt(start: string, end: string | null, atMs: number): boolean {
  return Date.parse(start) <= atMs && (end == null || Date.parse(end) > atMs);
}

function strategiesAt(input: {
  at: string;
  portfolioId: string;
  ticker: string | null;
  versions: HistoricalStrategyVersionRow[];
  applications: HistoricalStrategyEpisodeRow[];
  tickerApplications: HistoricalTickerEpisodeRow[];
}): Array<{ versionId: string; strategy: Strategy }> {
  const atMs = Date.parse(input.at);
  const activeStrategyIds = new Set(
    input.applications
      .filter(
        (row) =>
          row.portfolio_id === input.portfolioId &&
          activeAt(row.applied_at, row.removed_at, atMs),
      )
      .map((row) => row.strategy_id),
  );
  const latest = new Map<string, HistoricalStrategyVersionRow>();
  for (const row of input.versions) {
    if (!activeStrategyIds.has(row.strategy_id)) continue;
    if (!activeAt(row.effective_from, row.effective_to, atMs)) continue;
    const prior = latest.get(row.strategy_id);
    if (!prior || Date.parse(row.effective_from) > Date.parse(prior.effective_from)) {
      latest.set(row.strategy_id, row);
    }
  }
  return [...latest.values()].flatMap((row) => {
    const strategy = row.snapshot;
    if (input.ticker) {
      if (strategy.isDefault) {
        const assigned = input.tickerApplications.some(
          (episode) =>
            episode.strategy_id === strategy.id &&
            episode.portfolio_id === input.portfolioId &&
            episode.ticker === input.ticker &&
            activeAt(episode.applied_at, episode.removed_at, atMs),
        );
        if (!assigned) return [];
      } else if (
        (strategy.tickerExclusions?.[input.portfolioId] ?? []).some(
          (ticker) => ticker.toUpperCase() === input.ticker,
        )
      ) {
        return [];
      }
    }
    return [{
      versionId: row.id,
      strategy: {
        ...strategy,
        appliedPortfolioIds: [input.portfolioId],
      },
    }];
  });
}

function zones(primary: string | null, flags: string[]): StatusType[] {
  const allowed = new Set(["Trim Zone", "Add Zone", "Go to Cash"]);
  return [...new Set([primary, ...flags].filter((value) => value && allowed.has(value)))] as StatusType[];
}

function shadowPortfolio(
  portfolio: Portfolio,
  transaction: HistoricalTransactionRow,
  strategyIds: string[],
): Portfolio {
  if (transaction.kind !== "qty" || !transaction.ticker) return portfolio;
  if (portfolio.holdings.some((holding) => holding.ticker === transaction.ticker)) {
    return {
      ...portfolio,
      holdings: portfolio.holdings.map((holding) =>
        holding.ticker === transaction.ticker
          ? { ...holding, strategyIds }
          : holding,
      ),
    };
  }
  return {
    ...portfolio,
    holdings: [
      ...portfolio.holdings,
      {
        ticker: transaction.ticker,
        shares: 0,
        avgPrice: numberValue(transaction.fill_price),
        openPnlPct: 0,
        conviction: 0,
        status: "No Strategy",
        reason: "Historical pre-transaction state.",
        strategyIds,
      },
    ],
  };
}

export function applyHistoricalTransaction(
  portfolio: Portfolio,
  transaction: HistoricalTransactionRow,
  strategyIds: string[],
): Portfolio {
  if (transaction.kind === "cash") {
    return { ...portfolio, cashAvailable: numberValue(transaction.cash_after) };
  }
  const ticker = transaction.ticker;
  if (!ticker) return portfolio;
  const sharesAfter = numberValue(transaction.shares_after);
  const quantity = numberValue(transaction.quantity);
  const fillPrice = numberValue(transaction.fill_price);
  const holdings = [...portfolio.holdings];
  const index = holdings.findIndex((holding) => holding.ticker === ticker);
  const prior: PortfolioHolding = index >= 0
    ? holdings[index]!
    : {
        ticker,
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 0,
        status: "No Strategy",
        reason: "Historical reconstruction pending.",
        strategyIds: [],
      };
  const sharesBefore = numberValue(transaction.shares_before);
  const avgPrice = transaction.transaction_type === "buy" && sharesAfter > 0
    ? sharesBefore <= 0
      ? fillPrice
      : (prior.avgPrice * sharesBefore + fillPrice * quantity) / sharesAfter
    : sharesAfter <= 0 ? 0 : prior.avgPrice;
  const next = {
    ...prior,
    shares: sharesAfter,
    avgPrice,
    strategyIds: [...strategyIds],
  };
  if (index >= 0) holdings[index] = next;
  else holdings.push(next);
  return {
    ...portfolio,
    holdings,
    cashAvailable: numberValue(transaction.cash_after),
  };
}

export async function reconstructHistoricalChunk(input: {
  job: HistoricalJob;
  transactions: HistoricalTransactionRow[];
  versions: HistoricalStrategyVersionRow[];
  applications: HistoricalStrategyEpisodeRow[];
  tickerApplications: HistoricalTickerEpisodeRow[];
  fetchCycle: (at: string, symbols: string[]) => Promise<CompleteMarketCycle | null>;
}): Promise<{
  results: HistoricalResult[];
  workingPortfolio: HistoricalWorkingPortfolio;
}> {
  let workingPortfolio = input.job.working_portfolio;
  let replayReliable = workingPortfolio.historicalReplayReliable !== false;
  const results: HistoricalResult[] = [];
  const startMs = Date.parse(input.job.score_window_start);
  const endMs = Date.parse(input.job.score_window_end);

  for (const transaction of input.transactions) {
    if (!replayStateMatches(workingPortfolio, transaction)) {
      replayReliable = false;
    }
    const atMs = Date.parse(transaction.filled_at);
    const active = strategiesAt({
      at: transaction.filled_at,
      portfolioId: input.job.portfolio_id,
      ticker: transaction.ticker?.toUpperCase() ?? null,
      versions: input.versions,
      applications: input.applications,
      tickerApplications: input.tickerApplications,
    });
    const strategyIds = active.map((row) => row.strategy.id).sort();
    const strategyVersionIds = active.map((row) => row.versionId).sort();
    let result: HistoricalResult;

    if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) {
      result = {
        transactionId: transaction.id,
        status: "skipped",
        reason: "outside_seven_day_window",
        strategyIds: [],
        strategyVersionIds: [],
        zoneHints: [],
        alignment: [],
      };
    } else if (!replayReliable) {
      result = {
        transactionId: transaction.id,
        status: "incomplete",
        reason: "portfolio_replay_mismatch",
        strategyIds,
        strategyVersionIds,
        zoneHints: [],
        alignment: [],
      };
    } else if (strategyIds.length === 0) {
      result = {
        transactionId: transaction.id,
        status: "unscored",
        reason: "no_effective_strategy_assignment",
        strategyIds: [],
        strategyVersionIds: [],
        zoneHints: [],
        alignment: [],
      };
    } else if (transaction.kind === "cash") {
      result = {
        transactionId: transaction.id,
        status: "scored",
        reason: "cash_flow_attributed",
        strategyIds,
        strategyVersionIds,
        zoneHints: [],
        alignment: [],
      };
    } else {
      const scopedPortfolio = shadowPortfolio(workingPortfolio, transaction, strategyIds);
      const workspace = {
        portfolios: [scopedPortfolio],
        strategies: active.map((row) => row.strategy),
        share_fills: [],
      };
      const required = new Set<string>();
      for (const { strategy } of active) {
        for (const ticker of requiredTickersForStrategyCheck(workspace, strategy)) {
          required.add(ticker);
        }
      }
      const cycle = await input.fetchCycle(transaction.filled_at, [...required].sort());
      if (!cycle) {
        result = {
          transactionId: transaction.id,
          status: "incomplete",
          reason: "market_history_unavailable",
          strategyIds,
          strategyVersionIds,
          zoneHints: [],
          alignment: [],
        };
      } else {
        const missing = [...required].filter(
          (ticker) =>
            !cycle.quotes[ticker] ||
            !cycle.fundamentals[ticker] ||
            !cycle.technicals[ticker] ||
            !cycle.byTimeframe[ticker],
        );
        if (missing.length > 0 || !cycle.context) {
          result = {
            transactionId: transaction.id,
            status: "incomplete",
            reason: "market_history_incomplete",
            cycleKey: cycle.cycleKey,
            cycleAsOf: cycle.cycleAsOf,
            strategyIds,
            strategyVersionIds,
            zoneHints: [],
            alignment: [],
          };
        } else {
          const scored = scoreCombinedAuthority(workspace, cycle);
          const ticker = transaction.ticker?.toUpperCase();
          const alignments = scored.combinedResults.filter(
            (row) => row.portfolio_id === input.job.portfolio_id && row.ticker === ticker,
          );
          const zoneHints = [...new Set(alignments.flatMap((row) =>
            zones(row.resolved.primary, row.resolved.categoryFlags),
          ))];
          result = {
            transactionId: transaction.id,
            status: "scored",
            cycleKey: cycle.cycleKey,
            cycleAsOf: cycle.cycleAsOf,
            strategyIds,
            strategyVersionIds,
            zoneHints,
            alignment: alignments.map((row) => ({
              strategyIds: [...row.strategy_ids].sort(),
              conviction: row.conviction,
              primary: row.resolved.primary,
              flags: row.resolved.categoryFlags,
            })),
          };
        }
      }
    }
    results.push(result);
    workingPortfolio = applyHistoricalTransaction(
      workingPortfolio,
      transaction,
      strategyIds,
    );
  }
  return {
    results,
    workingPortfolio: {
      ...workingPortfolio,
      historicalReplayReliable: replayReliable,
    },
  };
}
