import type { PortfolioSnapshotRecord } from "../userStore";

export interface SparkPoint {
  /** ISO date `YYYY-MM-DD` (TradingView lightweight-charts UTC day). */
  time: string;
  value: number;
}

/** Pure: map portfolio snapshot rows to Open P&L % sparkline points. */
export function seriesToSparkPoints(
  rows: PortfolioSnapshotRecord[],
): SparkPoint[] {
  return rows
    .filter((row) => Number.isFinite(row.openPnlPct))
    .map((row) => ({
      time: row.asOf,
      value: row.openPnlPct,
    }));
}
