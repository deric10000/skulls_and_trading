import type { Bucket, CheckInterval, Strategy } from "../../types";
import { dataSource } from "../datasource";

// ---------------------------------------------------------------------------
// Refresh scheduler (STUB) — models how, with a LIVE data source, each bucket
// would be re-scored on its strategy's `checkInterval`, NOT by polling every
// ticker independently. Today it is a deliberate no-op against the mock source
// so the MVP makes ZERO network calls and costs $0.
//
// Design (for the live swap, see data-architecture.md):
//   - One batched fetch per bucket per `checkInterval` (15m … 1M), de-duped by
//     ticker across buckets sharing a cadence.
//   - Gated by market hours, tab visibility, and a per-metric TTL, plus a manual
//     "Refresh now" path.
//   - Fundamentals refresh on a fixed daily cadence regardless of checkInterval.
//   - Technicals candle = `technicalsInterval` (>= checkInterval, >= 15m).
//   - "Notify" = re-render the chips/tags downstream; no push system.
// ---------------------------------------------------------------------------

export const INTERVAL_MS: Record<CheckInterval, number> = {
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
};

export interface ScheduledBucket {
  bucketId: string;
  tickers: string[];
  checkInterval: CheckInterval;
  intervalMs: number;
}

export interface RefreshScheduler {
  /** The schedule that WOULD run against a live source (inert vs mock). */
  plan: ScheduledBucket[];
  /** No-op vs mock; wires timers/visibility gating against a live source. */
  start: () => void;
  stop: () => void;
}

// Whether the active data source is live (drives whether the scheduler runs).
// The mock source stamps snapshots with source "mock"; anything else is live.
function isLiveSource(): boolean {
  return dataSource.getMarketContext().source !== "mock";
}

// Market-hours / visibility gates are exposed for the live implementation. They
// are intentionally unused while the source is mock.
export function isUsRegularMarketHours(date = new Date()): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  // 13:30–20:00 UTC ≈ 9:30am–4:00pm ET (ignoring DST nuance for the stub).
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
    const checkInterval: CheckInterval = strategy?.checkInterval ?? "1D";
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
      // No-op against the static mock source: nothing to fetch, $0 cost.
      if (!isLiveSource()) return;
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
