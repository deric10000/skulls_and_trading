/**
 * Additive daily book / ticker marks after a live market pull.
 * Does not change Forge scoring or portfolioRunningTotals math — only persists
 * the same figures Current Watch / Helm already display from live alignment.
 */

import type { Portfolio, PortfolioTransaction, Strategy } from "../../types";
import { dataSource } from "../datasource";
import { portfolioRunningTotals } from "../finance/portfolioTotals";
import {
  etIsoDate,
  latestEtDay,
} from "../finance/portfolioSnapshotSeries";
import { computePortfolioAlignment } from "../forge/alignment";
import { shouldScoreTickerWithStrategy } from "../forge/tickerStrategy";
import {
  getLastDataPullAt,
  getLiveQuote,
  getMarketCycleMeta,
} from "../market/liveCache";
import {
  appendConvictionSnapshots,
  appendPortfolioSnapshots,
  type PortfolioSnapshotRow,
} from "../userStore";

/**
 * Snapshot day for Open P&L / conviction marks.
 * Prefer market-cycle + quote session time (ET). Mid-day refreshes that are
 * not check-driven cannot invent a calendar day ahead of Last Conviction Check.
 */
function resolvePersistAsOf(
  tickers: string[],
  strategyIds: string[],
  checkDriven: boolean,
): string {
  const cycle = getMarketCycleMeta();
  const quoteAsOfs = tickers.map((ticker) => getLiveQuote(ticker)?.asOf);
  const pullAsOfs = strategyIds.map((id) => getLastDataPullAt(id));
  const marketDay =
    latestEtDay([cycle?.cycleAsOf, ...quoteAsOfs, ...pullAsOfs]) ??
    etIsoDate();
  if (checkDriven) return marketDay;
  const checkDay = latestEtDay(pullAsOfs);
  if (checkDay && marketDay > checkDay) return checkDay;
  return marketDay;
}

/** Stamp conviction onto a day only when a check landed that ET day. */
function convictionForAsOf(
  asOf: string,
  conviction: number | null,
  strategyIds: string[],
  checkDriven: boolean,
): number | null {
  // Exact 0 is "no score / pending" in practice — never stamp it (spark skips 0
  // and a 0 upsert looks like a check day while leaving the series empty).
  if (conviction == null || !Number.isFinite(conviction) || conviction === 0) {
    return null;
  }
  if (checkDriven) return conviction;
  const latestPullDay = latestEtDay(
    strategyIds.map((id) => getLastDataPullAt(id)),
  );
  if (!latestPullDay || latestPullDay !== asOf) return null;
  return conviction;
}

function bookMetrics(
  portfolioId: string,
  asOf: string,
  ledger: PortfolioTransaction[] | undefined,
  /** Live Forge book conviction — never the stale holding.conviction seed. */
  conviction: number | null,
): Record<string, unknown> {
  const metrics: Record<string, unknown> = {
    ...cashFlowMetrics(portfolioId, asOf, ledger),
  };
  if (conviction != null && Number.isFinite(conviction) && conviction !== 0) {
    metrics.conviction = conviction;
  }
  return metrics;
}

function holdingMark(holding: Portfolio["holdings"][number]) {
  const info = dataSource.getTickerInfo(holding.ticker);
  const lastPrice = info?.lastPrice;
  if (
    lastPrice == null ||
    !Number.isFinite(lastPrice) ||
    !Number.isFinite(holding.shares) ||
    holding.shares <= 0 ||
    !Number.isFinite(holding.avgPrice)
  ) {
    return null;
  }
  const marketValue = lastPrice * holding.shares;
  const costBasis = holding.avgPrice * holding.shares;
  const openPnl = marketValue - costBasis;
  const openPnlPct = costBasis > 0 ? (openPnl / costBasis) * 100 : 0;
  return {
    lastPrice,
    marketValue,
    costBasis,
    openPnl,
    openPnlPct,
  };
}

function totalsFromHoldings(
  holdings: Portfolio["holdings"],
  cashAvailable: number,
) {
  const positions = [];
  for (const holding of holdings) {
    const mark = holdingMark(holding);
    if (!mark) continue;
    positions.push({
      price: mark.lastPrice,
      shares: holding.shares,
      avgPrice: holding.avgPrice,
    });
  }
  // Skip incomplete books rather than fabricate — need at least one priced
  // holding OR cash-only book with known cash.
  if (positions.length === 0 && cashAvailable <= 0) return null;
  return portfolioRunningTotals(positions, cashAvailable);
}

/**
 * Manual cash deposits/withdrawals for a calendar day (ISO date of filledAt).
 * Qty-driven cash moves are not cash ledger rows — they do not count here.
 */
function cashFlowMetrics(
  portfolioId: string,
  asOf: string,
  ledger: PortfolioTransaction[] | undefined,
): Record<string, unknown> {
  if (!ledger?.length) return {};
  let cashAdded = 0;
  let cashWithdrawn = 0;
  for (const tx of ledger) {
    if (tx.kind !== "cash" || tx.portfolioId !== portfolioId) continue;
    if (tx.filledAt.slice(0, 10) !== asOf) continue;
    if (tx.deltaCash > 0) cashAdded += tx.deltaCash;
    else if (tx.deltaCash < 0) cashWithdrawn += -tx.deltaCash;
  }
  const out: Record<string, unknown> = {};
  if (cashAdded > 0) out.cashAdded = cashAdded;
  if (cashWithdrawn > 0) out.cashWithdrawn = cashWithdrawn;
  return out;
}

/**
 * Upsert whole-book + per-strategy portfolio_snapshots and enrich
 * conviction_snapshots.payload for the given tickers.
 */
export async function persistBookAndConvictionMarks(
  portfolios: Portfolio[],
  strategies: Strategy[],
  tickers: string[],
  options?: { strategyId?: string; ledger?: PortfolioTransaction[] },
): Promise<void> {
  const checkDriven = Boolean(options?.strategyId);
  const appliedStrategyIds = strategies
    .filter((s) => (s.appliedPortfolioIds ?? []).length > 0)
    .map((s) => s.id);
  const asOfStrategyIds = options?.strategyId
    ? [options.strategyId]
    : appliedStrategyIds;
  // Market session day (ET), capped to Last Conviction Check on non-check writes
  // so Open P&L sparklines cannot invent a day ahead of the toast.
  const asOf = resolvePersistAsOf(tickers, asOfStrategyIds, checkDriven);
  const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
  const buckets = dataSource.getBuckets();
  const bookRows: PortfolioSnapshotRow[] = [];
  const convictionRows: {
    strategyId: string;
    ticker: string;
    asOf: string;
    conviction: number;
    status?: string;
    payload?: Record<string, unknown>;
  }[] = [];

  for (const portfolio of portfolios) {
    if (portfolio.type === "watchlist") {
      // Watchlists: still write when they have holdings (Helm can mirror them);
      // cash stays 0 unless later added.
    }
    const cash = portfolio.cashAvailable ?? 0;
    const applied = strategies.filter((s) =>
      (s.appliedPortfolioIds ?? []).includes(portfolio.id),
    );
    const appliedIds = applied.map((s) => s.id);
    const wholeAlignment = computePortfolioAlignment(
      portfolio,
      buckets,
      applied,
    );
    const wholeConviction =
      Object.keys(wholeAlignment.byTicker).length > 0
        ? wholeAlignment.portfolio.conviction
        : null;

    const whole = totalsFromHoldings(portfolio.holdings, cash);
    if (whole) {
      bookRows.push({
        portfolioId: portfolio.id,
        strategyId: "",
        asOf,
        holdingsMarketValue: whole.holdingsMarketValue,
        costBasis: whole.costBasis,
        cashAvailable: whole.cashAvailable,
        totalValue: whole.totalValue,
        openPnl: whole.openPnl,
        openPnlPct: whole.openPnlPct,
        metrics: bookMetrics(
          portfolio.id,
          asOf,
          options?.ledger,
          convictionForAsOf(
            asOf,
            wholeConviction,
            appliedIds,
            checkDriven,
          ),
        ),
      });
    }

    for (const strategy of applied) {
      if (options?.strategyId && strategy.id !== options.strategyId) continue;
      const filtered = portfolio.holdings.filter((h) =>
        shouldScoreTickerWithStrategy(h, strategy, portfolio.id),
      );
      const scoped = totalsFromHoldings(filtered, cash);
      if (!scoped) continue;
      const scopedAlignment = computePortfolioAlignment(
        portfolio,
        buckets,
        [strategy],
      );
      const scopedConviction =
        Object.keys(scopedAlignment.byTicker).length > 0
          ? scopedAlignment.portfolio.conviction
          : null;
      bookRows.push({
        portfolioId: portfolio.id,
        strategyId: strategy.id,
        asOf,
        holdingsMarketValue: scoped.holdingsMarketValue,
        costBasis: scoped.costBasis,
        cashAvailable: scoped.cashAvailable,
        totalValue: scoped.totalValue,
        openPnl: scoped.openPnl,
        openPnlPct: scoped.openPnlPct,
        metrics: bookMetrics(
          portfolio.id,
          asOf,
          options?.ledger,
          convictionForAsOf(
            asOf,
            scopedConviction,
            [strategy.id],
            checkDriven,
          ),
        ),
      });
    }
  }

  const strategyIdsForConviction = options?.strategyId
    ? strategies.filter((s) => s.id === options.strategyId)
    : strategies.filter((s) => (s.appliedPortfolioIds ?? []).length > 0);

  for (const strategy of strategyIdsForConviction) {
    for (const ticker of tickerSet) {
      let matched: {
        portfolio: Portfolio;
        holding: Portfolio["holdings"][number];
      } | null = null;
      for (const portfolio of portfolios) {
        if (!(strategy.appliedPortfolioIds ?? []).includes(portfolio.id)) {
          continue;
        }
        const holding = portfolio.holdings.find(
          (h) => h.ticker.toUpperCase() === ticker,
        );
        if (
          holding &&
          shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)
        ) {
          matched = { portfolio, holding };
          break;
        }
      }
      if (!matched) {
        const holding = portfolios
          .flatMap((p) =>
            p.holdings.map((h) => ({ portfolio: p, holding: h })),
          )
          .find(({ holding: h }) => h.ticker.toUpperCase() === ticker);
        if (!holding) continue;
        matched = holding;
      }
      const alignment = computePortfolioAlignment(
        matched.portfolio,
        buckets,
        [strategy],
      );
      const live = alignment.byTicker[ticker] ?? alignment.byTicker[matched.holding.ticker];
      if (!live || !Number.isFinite(live.conviction)) continue;
      if (
        convictionForAsOf(asOf, live.conviction, [strategy.id], checkDriven) ==
        null
      ) {
        continue;
      }
      const mark = holdingMark(matched.holding);
      convictionRows.push({
        strategyId: strategy.id,
        ticker,
        asOf,
        conviction: live.conviction,
        status: live.status,
        payload: mark
          ? {
              portfolioId: matched.portfolio.id,
              shares: matched.holding.shares,
              avgPrice: matched.holding.avgPrice,
              lastPrice: mark.lastPrice,
              marketValue: mark.marketValue,
              costBasis: mark.costBasis,
              openPnl: mark.openPnl,
              openPnlPct: mark.openPnlPct,
            }
          : {
              portfolioId: matched.portfolio.id,
              shares: matched.holding.shares,
              avgPrice: matched.holding.avgPrice,
            },
      });
    }
  }

  await Promise.all([
    appendPortfolioSnapshots(bookRows),
    appendConvictionSnapshots(convictionRows),
  ]);
}
