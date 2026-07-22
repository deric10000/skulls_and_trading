import type { PortfolioSnapshotRecord } from "../userStore";
import {
  DEFAULT_HELM_SPARK_RANGE,
  DEFAULT_HELM_TIMEFRAME,
  HELM_SPARK_RANGE_LABEL,
  HELM_TIMEFRAME_LABEL,
  clampHelmTimeframe,
  helmCadenceFloorForScope,
  helmTimeframeBounds,
  sparkRangeShowsPointMarkers,
  type HelmSparkRange,
  type HelmTimeframe,
} from "./helmTimeframe";

export type { HelmSparkRange, HelmTimeframe };
export {
  DEFAULT_HELM_SPARK_RANGE,
  DEFAULT_HELM_TIMEFRAME,
  HELM_SPARK_RANGE_LABEL,
  HELM_TIMEFRAME_LABEL,
  clampHelmTimeframe,
  helmCadenceFloorForScope,
  helmTimeframeBounds,
  sparkRangeShowsPointMarkers,
};

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

/** Pure: map snapshot `metrics.conviction` to sparkline points (0–100). */
export function seriesToConvictionSparkPoints(
  rows: PortfolioSnapshotRecord[],
): SparkPoint[] {
  const out: SparkPoint[] = [];
  for (const row of rows) {
    const raw = row.metrics?.conviction;
    const conviction = typeof raw === "number" ? raw : Number(raw);
    // Skip missing / non-finite. Also skip exact 0 — the pre-fix persist path
    // wrote stale holding.conviction (0) and is not a real Forge mark.
    if (!Number.isFinite(conviction) || conviction === 0) continue;
    out.push({ time: row.asOf, value: conviction });
  }
  return out;
}

/**
 * Merge per-strategy book marks into one point per as_of (mean of non-zero
 * convictions). Used for All-strategies Helm scope so we don't only read the
 * whole-book `strategy_id ''` row (often missing conviction).
 */
export function mergeConvictionSparkByDay(
  rows: PortfolioSnapshotRecord[],
): SparkPoint[] {
  const byDay = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.strategyId) continue;
    const raw = row.metrics?.conviction;
    const conviction = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(conviction) || conviction === 0) continue;
    const list = byDay.get(row.asOf) ?? [];
    list.push(conviction);
    byDay.set(row.asOf, list);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, values]) => ({
      time,
      value: values.reduce((sum, v) => sum + v, 0) / values.length,
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
  range: HelmTimeframe,
): SparkPoint[] {
  switch (range) {
    case "1h":
    case "2h":
    case "4h":
      // Daily marks cannot subdivide — show the latest session day in-window.
      return windowSparkPoints(points, 1);
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

/**
 * Apply the shared Helm range window, or seed a single live point when history
 * has not landed yet (new-user / empty metrics).
 */
export function displaySparkPointsForRange(
  points: SparkPoint[],
  range: HelmTimeframe,
  options: { loaded: boolean; seedValue: number; seedTime?: string },
): SparkPoint[] {
  const ranged = sparkPointsForRange(points, range);
  if (ranged.length > 0) return ranged;
  if (!options.loaded) return [];
  return [
    {
      time: options.seedTime ?? localIsoDate(),
      value: options.seedValue,
    },
  ];
}

/** Local calendar day as `YYYY-MM-DD` (new-user single-dot seed). */
export function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * America/New_York calendar day as `YYYY-MM-DD`.
 * Conviction check stamps and spark dates follow ET session days (same as the
 * Last Conviction Check toast), not the writer's UTC date.
 */
export function etIsoDate(input: Date | string = new Date()): string {
  if (typeof input === "string") {
    const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(input);
    // Bare calendar dates are already session days — don't rezone.
    if (dateOnly && !/[T\s]/.test(input.trim().slice(10))) {
      return dateOnly[1]!;
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      return dateOnly?.[1] ?? localIsoDate();
    }
    input = parsed;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input);
}

/**
 * Latest ET calendar day among ISO timestamps / date-only strings.
 * Used so Open P&L + conviction spark `as_of` track market/check time, not
 * the writer's wall clock.
 */
export function latestEtDay(
  timestamps: Array<string | null | undefined>,
): string | undefined {
  let bestMs = Number.NEGATIVE_INFINITY;
  let bestDay: string | undefined;
  for (const raw of timestamps) {
    if (!raw) continue;
    const day = etIsoDate(raw);
    const ms = Date.parse(raw);
    const rank = Number.isNaN(ms) ? Date.parse(`${day}T12:00:00.000Z`) : ms;
    if (Number.isNaN(rank)) continue;
    if (rank >= bestMs) {
      bestMs = rank;
      bestDay = day;
    }
  }
  return bestDay;
}

/** Drop spark points after the last authoritative session/check day. */
export function clipSparkPointsThrough(
  points: SparkPoint[],
  endIso: string,
): SparkPoint[] {
  return points.filter((point) => point.time <= endIso);
}

function parseIsoDateUtc(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
