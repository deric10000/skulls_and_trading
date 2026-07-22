/**
 * Shared Helm Progress / Plan Adherence timeframe.
 * Toggle UI comes later — default `1w`; cadence floors unlock 1h/2h/4h when
 * the focused strategy (or coarsest All-strategies cadence) allows.
 */

import type { CheckInterval, Strategy } from "../../types";
import { INTERVAL_MS } from "../forge/scheduler";
import { etIsoDate } from "./portfolioSnapshotSeries";

/** All Helm metric windows (sparks + Plan Adherence). */
export type HelmTimeframe =
  | "1h"
  | "2h"
  | "4h"
  | "1w"
  | "1m"
  | "1y"
  | "ytd";

/** @deprecated Prefer HelmTimeframe — kept for spark call sites. */
export type HelmSparkRange = HelmTimeframe;

export const DEFAULT_HELM_TIMEFRAME: HelmTimeframe = "1w";
export const DEFAULT_HELM_SPARK_RANGE = DEFAULT_HELM_TIMEFRAME;

export const HELM_TIMEFRAME_LABEL: Record<HelmTimeframe, string> = {
  "1h": "1 Hour",
  "2h": "2 Hours",
  "4h": "4 Hours",
  "1w": "1 Week",
  "1m": "1 Month",
  "1y": "1 Year",
  ytd: "YTD",
};

export const HELM_SPARK_RANGE_LABEL = HELM_TIMEFRAME_LABEL;

/** Coarser = slower trading cadence (All strategies uses the max). */
const CANDLE_FLOOR_RANK: Record<string, number> = {
  "1h": 1,
  "2h": 2,
  "4h": 3,
  "1D": 4,
  "1W": 5,
  "1M": 6,
};

export type HelmCadenceFloor = "1h" | "2h" | "4h" | "1D";

function isCandleFloorKey(interval: CheckInterval): boolean {
  return Object.prototype.hasOwnProperty.call(CANDLE_FLOOR_RANK, interval);
}

/** Finest (lowest rank) candle check interval on a strategy; session-only → 1D. */
export function strategyCadenceFloor(strategy: Strategy): HelmCadenceFloor {
  const checks = [
    strategy.checkInterval,
    ...(strategy.sessionCloseChecks ?? []),
  ].filter(Boolean) as CheckInterval[];
  let finest: HelmCadenceFloor = "1D";
  let finestRank = CANDLE_FLOOR_RANK["1D"]!;
  for (const interval of checks) {
    if (interval === "15m" || interval === "30m") {
      // Future Capability — treat as 1h floor.
      if (1 < finestRank) {
        finest = "1h";
        finestRank = 1;
      }
      continue;
    }
    if (!isCandleFloorKey(interval)) {
      // Session closes are daily-or-better for Helm flooring.
      continue;
    }
    const rank = CANDLE_FLOOR_RANK[interval];
    if (rank != null && rank < finestRank) {
      finestRank = rank;
      finest = interval as HelmCadenceFloor;
    }
  }
  return finest;
}

/** All strategies → coarsest (slowest) floor among applied strategies. */
export function helmCadenceFloorForScope(
  strategies: Strategy[],
  focusedStrategyId: string | null | undefined,
): HelmCadenceFloor {
  const scoped = focusedStrategyId
    ? strategies.filter((s) => s.id === focusedStrategyId)
    : strategies;
  if (scoped.length === 0) return "1D";
  let coarsest: HelmCadenceFloor = "1h";
  let coarsestRank = 0;
  for (const strategy of scoped) {
    const floor = strategyCadenceFloor(strategy);
    const rank = CANDLE_FLOOR_RANK[floor] ?? 4;
    if (rank > coarsestRank) {
      coarsestRank = rank;
      coarsest = floor;
    }
  }
  return coarsestRank === 0 ? "1D" : coarsest;
}

/** Timeframes unlocked for the current cadence floor (toggle UI later). */
export function availableHelmTimeframes(
  floor: HelmCadenceFloor,
): HelmTimeframe[] {
  const base: HelmTimeframe[] = ["1w", "1m", "1y", "ytd"];
  if (floor === "1D") return base;
  if (floor === "4h") return ["4h", ...base];
  if (floor === "2h") return ["2h", "4h", ...base];
  return ["1h", "2h", "4h", ...base];
}

/**
 * Clamp a requested timeframe to what the cadence floor allows.
 * Default `1w` always remains valid.
 */
export function clampHelmTimeframe(
  requested: HelmTimeframe,
  floor: HelmCadenceFloor,
): HelmTimeframe {
  const allowed = availableHelmTimeframes(floor);
  return allowed.includes(requested) ? requested : DEFAULT_HELM_TIMEFRAME;
}

export interface HelmTimeframeBounds {
  /** Inclusive lower bound ISO timestamp. */
  fromIso: string;
  /** Inclusive upper bound ISO timestamp. */
  toIso: string;
  /** ET calendar day of fromIso. */
  fromDate: string;
  /** ET calendar day of toIso. */
  toDate: string;
}

/** Window ending at `end` (default now) for event / ledger filters. */
export function helmTimeframeBounds(
  range: HelmTimeframe,
  end: Date = new Date(),
): HelmTimeframeBounds {
  const toMs = end.getTime();
  let fromMs = toMs;
  switch (range) {
    case "1h":
      fromMs = toMs - INTERVAL_MS["1h"];
      break;
    case "2h":
      fromMs = toMs - INTERVAL_MS["2h"];
      break;
    case "4h":
      fromMs = toMs - INTERVAL_MS["4h"];
      break;
    case "1w":
      fromMs = toMs - 7 * INTERVAL_MS["1D"];
      break;
    case "1m":
      fromMs = toMs - 30 * INTERVAL_MS["1D"];
      break;
    case "1y":
      fromMs = toMs - 365 * INTERVAL_MS["1D"];
      break;
    case "ytd": {
      const et = etIsoDate(end);
      fromMs = Date.parse(`${et.slice(0, 4)}-01-01T00:00:00.000-05:00`);
      if (Number.isNaN(fromMs)) {
        fromMs = Date.UTC(end.getUTCFullYear(), 0, 1);
      }
      break;
    }
  }
  const from = new Date(fromMs);
  const to = new Date(toMs);
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDate: etIsoDate(from),
    toDate: etIsoDate(to),
  };
}

export function sparkRangeShowsPointMarkers(range: HelmTimeframe): boolean {
  return range === "1w";
}
