/**
 * Additive daily book / ticker marks after a live market pull.
 * Does not change Forge scoring or portfolioRunningTotals math — only persists
 * the same figures Current Watch already displays.
 */

import type { Portfolio, Strategy } from "../../types";
import { dataSource } from "../datasource";
import { portfolioRunningTotals } from "../finance/portfolioTotals";
import { shouldScoreTickerWithStrategy } from "../forge/tickerStrategy";
import {
  appendConvictionSnapshots,
  appendPortfolioSnapshots,
  type PortfolioSnapshotRow,
} from "../userStore";

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
 * Upsert whole-book + per-strategy portfolio_snapshots and enrich
 * conviction_snapshots.payload for the given tickers.
 */
export async function persistBookAndConvictionMarks(
  portfolios: Portfolio[],
  strategies: Strategy[],
  tickers: string[],
  options?: { strategyId?: string },
): Promise<void> {
  const asOf = new Date().toISOString().slice(0, 10);
  const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
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
      });
    }

    const applied = strategies.filter((s) =>
      (s.appliedPortfolioIds ?? []).includes(portfolio.id),
    );
    for (const strategy of applied) {
      if (options?.strategyId && strategy.id !== options.strategyId) continue;
      const filtered = portfolio.holdings.filter((h) =>
        shouldScoreTickerWithStrategy(h, strategy, portfolio.id),
      );
      const scoped = totalsFromHoldings(filtered, cash);
      if (!scoped) continue;
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
        // Still record conviction if any holding exists for this strategy refresh
        const holding = portfolios
          .flatMap((p) =>
            p.holdings.map((h) => ({ portfolio: p, holding: h })),
          )
          .find(({ holding: h }) => h.ticker.toUpperCase() === ticker);
        if (!holding) continue;
        matched = holding;
      }
      const mark = holdingMark(matched.holding);
      convictionRows.push({
        strategyId: strategy.id,
        ticker,
        asOf,
        conviction: matched.holding.conviction ?? 0,
        status: matched.holding.status,
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
