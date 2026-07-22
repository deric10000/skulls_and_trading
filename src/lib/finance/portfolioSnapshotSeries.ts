import type { PortfolioSnapshotRecord } from "../userStore";

export interface SparkPoint {
  /** ISO date `YYYY-MM-DD` (TradingView lightweight-charts UTC day). */
  time: string;
  value: number;
}

/**
 * Helm Progress sparkline window. Toggle UI comes later for all Progress
 * metrics — Open P&L ships the default (`1w`) indicator only for now.
 */
export type HelmSparkRange = "1w" | "1m" | "1y" | "ytd";

export const DEFAULT_HELM_SPARK_RANGE: HelmSparkRange = "1w";

/** Display labels (`.panel-tag` uppercases). */
export const HELM_SPARK_RANGE_LABEL: Record<HelmSparkRange, string> = {
  "1w": "1 Week",
  "1m": "1 Month",
  "1y": "1 Year",
  ytd: "YTD",
};

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

/**
 * Keep the trailing calendar-day window ending on the last point (or on
 * `endIso` when provided).
 */
export function windowSparkPoints(
  points: SparkPoint[],
  calendarDays: number,
  endIso?: string,
): SparkPoint[] {
  if (calendarDays <= 0) return [];
  if (points.length === 0) return [];
  const end = endIso ?? points[points.length - 1]!.time;
  const endDate = parseIsoDateUtc(end);
  if (!endDate) return points.slice();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (calendarDays - 1));
  const start = startDate.toISOString().slice(0, 10);
  return points.filter((point) => point.time >= start && point.time <= end);
}

/** Points from Jan 1 of the end year's calendar through the end date. */
export function windowSparkPointsYtd(
  points: SparkPoint[],
  endIso?: string,
): SparkPoint[] {
  if (points.length === 0) return [];
  const end = endIso ?? points[points.length - 1]!.time;
  const endDate = parseIsoDateUtc(end);
  if (!endDate) return points.slice();
  const start = `${endDate.getUTCFullYear()}-01-01`;
  return points.filter((point) => point.time >= start && point.time <= end);
}

/** Apply a Helm spark range to a point series. */
export function sparkPointsForRange(
  points: SparkPoint[],
  range: HelmSparkRange,
): SparkPoint[] {
  switch (range) {
    case "1w":
      return windowSparkPoints(points, 7);
    case "1m":
      return windowSparkPoints(points, 30);
    case "1y":
      return windowSparkPoints(points, 365);
    case "ytd":
      return windowSparkPointsYtd(points);
  }
}

/** Session dots only on day/week views — off for month/year/YTD later. */
export function sparkRangeShowsPointMarkers(range: HelmSparkRange): boolean {
  return range === "1w";
}

/** Local calendar day as `YYYY-MM-DD` (new-user single-dot seed). */
export function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDateUtc(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
