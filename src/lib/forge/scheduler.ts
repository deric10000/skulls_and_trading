/**
 * Refresh scheduler — batches due tickers by checkInterval (Beta 0 floor: daily+).
 * Gates on tab visibility + US regular hours; AppState wires `onDue` → live refresh.
 */

import type { Bucket, CheckInterval, Strategy } from "../../types";

export const INTERVAL_MS: Record<CheckInterval, number> = {
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
};

/** Beta 0 free-tier floor — sub-daily options are UI-disabled and clamped. */
export const BETA0_CADENCE_FLOOR: CheckInterval[] = ["1D", "1W", "1M"];

export function clampCadenceInterval(interval?: CheckInterval): CheckInterval {
  if (interval && BETA0_CADENCE_FLOOR.includes(interval)) return interval;
  return "1D";
}

export interface ScheduledBucket {
  bucketId: string;
  tickers: string[];
  checkInterval: CheckInterval;
  intervalMs: number;
}

export interface RefreshScheduler {
  plan: ScheduledBucket[];
  start: () => void;
  stop: () => void;
}

export function isUsRegularMarketHours(date = new Date()): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return minutes >= 13 * 60 + 30 && minutes <= 20 * 60;
}

export function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function createRefreshScheduler(
  buckets: Bucket[],
  strategies: Strategy[],
  onDue: (bucketId: string) => void,
): RefreshScheduler {
  const plan: ScheduledBucket[] = buckets.map((bucket) => {
    const strategy = strategies.find((item) => item.id === bucket.strategyId);
    const checkInterval = clampCadenceInterval(strategy?.checkInterval);
    return {
      bucketId: bucket.id,
      tickers: bucket.holdings.map((holding) => holding.ticker),
      checkInterval,
      intervalMs: INTERVAL_MS[checkInterval],
    };
  });

  let timers: ReturnType<typeof setInterval>[] = [];

  return {
    plan,
    start: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = plan.map((scheduled) =>
        setInterval(() => {
          if (!isTabVisible() || !isUsRegularMarketHours()) return;
          onDue(scheduled.bucketId);
        }, scheduled.intervalMs),
      );
    },
    stop: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = [];
    },
  };
}
