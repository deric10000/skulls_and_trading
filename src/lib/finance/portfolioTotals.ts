/**
 * Portfolio-level running totals for Current Watch (holdings MV + cash).
 */

import { openPnlTotal } from "./averageCost";

export interface PositionMark {
  price: number;
  shares: number;
  avgPrice: number;
}

export interface PortfolioRunningTotals {
  /** Sum of lastPrice × shares across owned names. */
  holdingsMarketValue: number;
  /** Settled cash not invested in holdings. */
  cashAvailable: number;
  /** holdingsMarketValue + cashAvailable. */
  totalValue: number;
  /** Sum of (last − avg) × shares. */
  openPnl: number;
  /** openPnl / cost basis × 100 (0 when cost basis is 0). */
  openPnlPct: number;
  /** Sum of avgPrice × shares. */
  costBasis: number;
}

/** Aggregate market value, open P&L, and cash for a portfolio or watchlist. */
export function portfolioRunningTotals(
  positions: PositionMark[],
  cashAvailable = 0,
): PortfolioRunningTotals {
  let holdingsMarketValue = 0;
  let costBasis = 0;
  let openPnl = 0;
  for (const position of positions) {
    if (position.shares <= 0) continue;
    holdingsMarketValue += position.price * position.shares;
    costBasis += position.avgPrice * position.shares;
    openPnl += openPnlTotal(
      position.price,
      position.avgPrice,
      position.shares,
    );
  }
  const cash = Number.isFinite(cashAvailable) ? Math.max(0, cashAvailable) : 0;
  return {
    holdingsMarketValue,
    cashAvailable: cash,
    totalValue: holdingsMarketValue + cash,
    openPnl,
    openPnlPct: costBasis > 0 ? (openPnl / costBasis) * 100 : 0,
    costBasis,
  };
}
