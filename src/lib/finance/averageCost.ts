/**
 * Average-cost (retail brokerage default) helpers for qty edits.
 * FIFO (tax-lot peel) is deferred — avg cost powers Avg. Price / Open P&L.
 */

import type { QtySide } from "../../types";

export type { QtySide };

export function qtySideFromDelta(delta: number): QtySide | null {
  if (delta > 0) return "buy";
  if (delta < 0) return "sell";
  return null;
}

/** Weighted-average cost after a buy. Sell leaves avg unchanged (retail avg-cost). */
export function nextAverageCost(opts: {
  sharesBefore: number;
  avgBefore: number;
  side: QtySide;
  deltaShares: number; // magnitude, always > 0
  fillPrice: number;
  sharesAfter: number;
}): number {
  const { sharesBefore, avgBefore, side, deltaShares, fillPrice, sharesAfter } =
    opts;
  if (sharesAfter <= 0) return 0;
  if (side === "sell") {
    // Remaining shares keep the prior average cost.
    return avgBefore > 0 ? avgBefore : 0;
  }
  // Buy: first lot or re-open after flat → fill becomes avg.
  if (sharesBefore <= 0 || avgBefore <= 0) return fillPrice;
  const costBefore = avgBefore * sharesBefore;
  const costAdded = fillPrice * deltaShares;
  return (costBefore + costAdded) / sharesAfter;
}

/** Open P&L % vs average cost. "last" = current mark / last price. */
export function openPnlPercent(lastPrice: number, avgPrice: number): number {
  if (avgPrice <= 0 || lastPrice <= 0) return 0;
  return ((lastPrice - avgPrice) / avgPrice) * 100;
}

/** Open P&L $ for the whole position. No mark → $0 (never treat as total loss). */
export function openPnlTotal(
  lastPrice: number,
  avgPrice: number,
  shares: number,
): number {
  if (shares <= 0 || lastPrice <= 0) return 0;
  return (lastPrice - avgPrice) * shares;
}
