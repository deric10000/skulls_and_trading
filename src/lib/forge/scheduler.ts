/**
 * Strategy check scheduler. Market data is pulled by Worker cron; this browser
 * scheduler only reads completed cycles and runs pure scoring on fixed cadence
 * boundaries. Notification preferences never gate checks.
 */

import type {
  CandleInterval,
  CheckInterval,
  Portfolio,
  SessionCloseInterval,
  Strategy,
} from "../../types";
import { shouldScoreTickerWithStrategy } from "./tickerStrategy";

const DAY_MS = 24 * 60 * 60_000;
const lastFiredBySchedule = new Map<string, number>();

/** Fixed-length candle sizes in ms. Session-closes are event-based (see below). */
export const INTERVAL_MS: Record<CandleInterval, number> = {
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1D": 24 * 60 * 60_000,
  "1W": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
};

/** US session-close boundaries, ET minutes-from-midnight. */
export const SESSION_CLOSE_ET_MINUTES: Record<SessionCloseInterval, number> = {
  "close-premarket": 9 * 60 + 30, // 09:30
  "close-regular": 16 * 60, // 16:00
  "close-afterhours": 20 * 60, // 20:00
  "close-overnight": 4 * 60, // 04:00
};

/** Human labels for every cadence option — shared by the Forge UI. */
export const INTERVAL_LABEL: Record<CheckInterval, string> = {
  "15m": "Every 15 min",
  "30m": "Every 30 min",
  "1h": "Hourly",
  "2h": "Every 2 hours",
  "4h": "Every 4 hours",
  "1D": "Daily",
  "1W": "Weekly",
  "1M": "Monthly",
  "close-premarket": "At premarket close (9:30am ET)",
  "close-regular": "At regular close (4:00pm ET)",
  "close-afterhours": "At after-hours close (8:00pm ET)",
  "close-overnight": "At overnight close (4:00am ET)",
};

/**
 * Cadence options currently enabled, in display order. 15m is intentionally
 * excluded — it ships as a disabled "Future Capability" option in the UI.
 */
export const ENABLED_CADENCE: CheckInterval[] = [
  "close-premarket",
  "close-regular",
  "close-afterhours",
  "close-overnight",
  "1h",
  "2h",
  "4h",
  "1D",
  "1W",
  "1M",
];

/** Enabled candle sizes for the Technicals dropdown (candle-only, no 15m). */
export const ENABLED_CANDLE: CandleInterval[] = [
  "1h",
  "2h",
  "4h",
  "1D",
  "1W",
  "1M",
];

export function isSessionClose(
  interval: CheckInterval,
): interval is SessionCloseInterval {
  return interval.startsWith("close-");
}

/** Clamp sub-hour/unknown cadence to the reliable 1h floor. */
export function clampCadenceInterval(interval?: CheckInterval): CheckInterval {
  if (!interval) return "1D";
  if (ENABLED_CADENCE.includes(interval)) return interval;
  if (interval === "15m" || interval === "30m") return "1h";
  return "1D";
}

/** Clamp a technical candle size to the reliable 1h floor. */
export function clampCandleInterval(interval?: CheckInterval): CandleInterval {
  if (interval && ENABLED_CANDLE.includes(interval as CandleInterval)) {
    return interval as CandleInterval;
  }
  if (interval === "15m" || interval === "30m") return "1h";
  return "1D";
}

export interface StrategySchedule {
  strategyId: string;
  tickers: string[];
  checkInterval: CheckInterval;
  /** Candle ms, or DAY_MS placeholder for event/day-based cadences. */
  intervalMs: number;
}

export interface RefreshScheduler {
  plan: StrategySchedule[];
  start: () => void;
  stop: () => void;
}

/** ET calendar parts for a moment. */
function etParts(date: Date): {
  mins: number;
  dayKey: string;
  weekday: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    mins: hour * 60 + minute,
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
  };
}

function etMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/**
 * Label a completed hourly market cycle with the last boundary valid for one
 * strategy. This keeps 2h/4h/daily stamps aligned to ET candle closes.
 */
export function checkBoundaryForCycle(
  strategy: Strategy,
  cycleAsOf: string,
): string {
  return boundaryForInterval(
    clampCadenceInterval(strategy.checkInterval),
    cycleAsOf,
  );
}

export function boundaryForInterval(
  interval: CheckInterval,
  cycleAsOf: string,
): string {
  const raw = Date.parse(cycleAsOf);
  if (Number.isNaN(raw)) return cycleAsOf;
  if (isSessionClose(interval) || interval === "1h") return cycleAsOf;
  const maxHours =
    interval === "2h"
      ? 2
      : interval === "4h"
        ? 4
        : interval === "1D"
          ? 48
          : interval === "1W"
            ? 24 * 8
            : 24 * 40;

  for (let offset = 0; offset <= maxHours; offset += 1) {
    const candidate = new Date(raw - offset * 60 * 60_000);
    const { mins, weekday } = etParts(candidate);
    const hour = Math.floor(mins / 60);
    if (interval === "2h" && mins % 60 === 0 && hour % 2 === 0) {
      return candidate.toISOString();
    }
    if (interval === "4h" && mins % 60 === 0 && hour % 4 === 0) {
      return candidate.toISOString();
    }
    const weekdayClose =
      mins === 16 * 60 && weekday !== "Sat" && weekday !== "Sun";
    if (interval === "1D" && weekdayClose) return candidate.toISOString();
    if (interval === "1W" && weekdayClose && weekday === "Fri") {
      return candidate.toISOString();
    }
    if (interval === "1M" && weekdayClose) {
      const nextWeekday = new Date(candidate.getTime() + 24 * 60 * 60_000);
      while (["Sat", "Sun"].includes(etParts(nextWeekday).weekday)) {
        nextWeekday.setTime(nextWeekday.getTime() + 24 * 60 * 60_000);
      }
      if (etMonthKey(nextWeekday) !== etMonthKey(candidate)) {
        return candidate.toISOString();
      }
    }
  }
  return cycleAsOf;
}

const HOUR_MS = 60 * 60_000;

function isEtMonthEndClose(candidateMs: number): boolean {
  const candidate = new Date(candidateMs);
  const { mins, weekday } = etParts(candidate);
  if (mins !== 16 * 60 || weekday === "Sat" || weekday === "Sun") return false;
  const nextWeekday = new Date(candidateMs + DAY_MS);
  while (["Sat", "Sun"].includes(etParts(nextWeekday).weekday)) {
    nextWeekday.setTime(nextWeekday.getTime() + DAY_MS);
  }
  return etMonthKey(nextWeekday) !== etMonthKey(candidate);
}

function matchesCadenceBoundary(
  interval: CheckInterval,
  atMs: number,
): boolean {
  const parts = etParts(new Date(atMs));
  const hour = Math.floor(parts.mins / 60);
  if (isSessionClose(interval)) {
    if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
    return parts.mins === SESSION_CLOSE_ET_MINUTES[interval];
  }
  if (interval === "1h") {
    return atMs % HOUR_MS === 0;
  }
  if (interval === "2h") {
    return parts.mins % 60 === 0 && hour % 2 === 0;
  }
  if (interval === "4h") {
    return parts.mins % 60 === 0 && hour % 4 === 0;
  }
  if (interval === "1D") {
    return (
      parts.mins === 16 * 60 &&
      parts.weekday !== "Sat" &&
      parts.weekday !== "Sun"
    );
  }
  if (interval === "1W") {
    return parts.mins === 16 * 60 && parts.weekday === "Fri";
  }
  if (interval === "1M") {
    return isEtMonthEndClose(atMs);
  }
  return false;
}

/**
 * Next cadence boundary strictly after `from` (exclusive). Aligns to ET session
 * closes / candle walls — never "now + interval length".
 */
export function nextCadenceAt(
  interval: CheckInterval,
  from: Date = new Date(),
): string {
  const clamped = clampCadenceInterval(interval);
  const fromMs = from.getTime();
  if (clamped === "1h") {
    return new Date(Math.floor(fromMs / HOUR_MS) * HOUR_MS + HOUR_MS).toISOString();
  }
  // Minute steps cover session closes and ET-aligned multi-hour/day walls.
  let t = Math.floor(fromMs / 60_000) * 60_000 + 60_000;
  const limit = fromMs + 45 * DAY_MS;
  while (t <= limit) {
    if (matchesCadenceBoundary(clamped, t)) {
      return new Date(t).toISOString();
    }
    t += 60_000;
  }
  return new Date(fromMs + DAY_MS).toISOString();
}

/**
 * Next check the user should expect to see after an optional last stamp.
 * Walks cadence walls until the result is strictly in the future.
 */
export function nextCheckAt(
  interval: CheckInterval,
  lastAt: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const cursor =
    lastAt && !Number.isNaN(Date.parse(lastAt))
      ? Date.parse(lastAt)
      : nowMs - 1;
  let next = nextCadenceAt(interval, new Date(cursor));
  let guard = 0;
  while (Date.parse(next) <= nowMs && guard < 64) {
    next = nextCadenceAt(interval, new Date(Date.parse(next)));
    guard += 1;
  }
  return next;
}

/** Cadence walls a strategy actually schedules (primary + session-close multi-select). */
export function scheduledIntervalsForStrategy(strategy: Strategy): CheckInterval[] {
  const primary = clampCadenceInterval(strategy.checkInterval);
  const extras = strategy.sessionCloseChecks ?? [];
  return [primary, ...extras].filter(
    (interval, index, all) => all.indexOf(interval) === index,
  );
}

/** Soonest upcoming check across a strategy's scheduled intervals. */
export function nextStrategyCheckAt(
  strategy: Strategy,
  lastAt: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const times = scheduledIntervalsForStrategy(strategy).map((interval) =>
    Date.parse(nextCheckAt(interval, lastAt, nowMs)),
  );
  return new Date(Math.min(...times)).toISOString();
}

/** US regular hours in ET approximated via America/New_York parts. */
export function isUsRegularMarketHours(date = new Date()): boolean {
  const { mins, weekday } = etParts(date);
  if (weekday === "Sat" || weekday === "Sun") return false;
  return mins >= 9 * 60 + 30 && mins <= 16 * 60;
}

/**
 * For daily cadence: due once after the prior ET regular close (16:00) when the
 * tab is open during the next regular session — poll periodically and fire if
 * lastFire was before today's session open.
 */
export function isDailyCloseDue(
  lastFireAt: number | null,
  now = new Date(),
): boolean {
  if (!isUsRegularMarketHours(now)) return false;
  const { dayKey } = etParts(now);
  if (lastFireAt != null) {
    const { dayKey: lastKey } = etParts(new Date(lastFireAt));
    if (lastKey === dayKey) return false;
  }
  return true;
}

/**
 * Session-close cadence: due once per weekday, after the given ET boundary time
 * has passed, if it has not already fired that ET day.
 */
export function isSessionCloseDue(
  interval: SessionCloseInterval,
  lastFireAt: number | null,
  now = new Date(),
): boolean {
  const boundaryMin = SESSION_CLOSE_ET_MINUTES[interval];
  const { mins, dayKey, weekday } = etParts(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  if (mins < boundaryMin) return false;
  if (lastFireAt != null) {
    const { dayKey: lastKey } = etParts(new Date(lastFireAt));
    if (lastKey === dayKey) return false;
  }
  return true;
}

/** Hourly market cycle that can contain the latest selected session close. */
export function sessionCycleBoundary(
  interval: SessionCloseInterval,
  availableAt: Date,
): string {
  const targetMinutes = SESSION_CLOSE_ET_MINUTES[interval];
  const { mins } = etParts(availableAt);
  const deltaMinutes = (mins - targetMinutes + 24 * 60) % (24 * 60);
  const exactBoundary =
    availableAt.getTime() -
    deltaMinutes * 60_000 -
    (availableAt.getTime() % 60_000);
  return new Date(
    Math.ceil(exactBoundary / (60 * 60_000)) * 60 * 60_000,
  ).toISOString();
}

export function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

/** Tickers assigned to a strategy across applied portfolios (holdings.strategyIds). */
export function tickersForStrategy(
  strategy: Strategy,
  portfolios: Portfolio[],
): string[] {
  const applied = new Set(strategy.appliedPortfolioIds ?? []);
  const exclusions = strategy.tickerExclusions ?? {};
  const tickers = new Set<string>();
  for (const portfolio of portfolios) {
    if (!applied.has(portfolio.id)) continue;
    const excluded = new Set(
      (exclusions[portfolio.id] ?? []).map((t) => t.toUpperCase()),
    );
    for (const holding of portfolio.holdings) {
      if (!shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) {
        continue;
      }
      const t = holding.ticker.toUpperCase();
      if (excluded.has(t)) continue;
      tickers.add(t);
    }
  }
  return [...tickers];
}

/** Applied strategies always participate in scheduled checks. */
export function isStrategyCheckScheduled(strategy: Strategy): boolean {
  return (strategy.appliedPortfolioIds ?? []).length > 0;
}

export function createRefreshScheduler(
  portfolios: Portfolio[],
  strategies: Strategy[],
  onDue: (
    strategyId: string,
    tickers: string[],
    interval: CheckInterval,
    requiredCycleAt: string,
  ) => Promise<boolean>,
): RefreshScheduler {
  const plan: StrategySchedule[] = strategies
    .filter(isStrategyCheckScheduled)
    .flatMap((strategy) => {
      const checkInterval = clampCadenceInterval(strategy.checkInterval);
      const intervals = [
        checkInterval,
        ...(strategy.sessionCloseChecks ?? []),
      ].filter(
        (interval, index, all) => all.indexOf(interval) === index,
      );
      return intervals.map((interval) => ({
        strategyId: strategy.id,
        tickers: tickersForStrategy(strategy, portfolios),
        checkInterval: interval,
        intervalMs: isSessionClose(interval)
          ? DAY_MS
          : INTERVAL_MS[interval],
      }));
    })
    .filter((item) => item.tickers.length > 0);

  let timers: ReturnType<typeof setInterval>[] = [];
  return {
    plan,
    start: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = plan.map((scheduled) => {
        const { checkInterval } = scheduled;
        const scheduleKey = `${scheduled.strategyId}:${checkInterval}`;
        const sessionClose = isSessionClose(checkInterval);
        // Event/day-based cadences poll on a coarse timer; sub-daily candles
        // poll at their own interval.
        const pollMs = sessionClose
          ? 5 * 60_000
          : checkInterval === "1D" ||
              checkInterval === "1W" ||
              checkInterval === "1M"
            ? 15 * 60_000
            : scheduled.intervalMs;

        const tick = async () => {
          if (!isTabVisible()) return;
          const last = lastFiredBySchedule.get(scheduleKey) ?? null;
          let due = false;
          const shiftedNow = Date.now() - 60 * 60_000;
          let requiredCycleAt = new Date(
            Math.floor(shiftedNow / (60 * 60_000)) * 60 * 60_000,
          ).toISOString();
          if (sessionClose) {
            due = isSessionCloseDue(
              checkInterval,
              last,
              new Date(shiftedNow),
            );
            requiredCycleAt = sessionCycleBoundary(
              checkInterval,
              new Date(shiftedNow),
            );
          } else {
            requiredCycleAt = boundaryForInterval(
              checkInterval,
              requiredCycleAt,
            );
            const availableBoundary = Date.parse(
              requiredCycleAt,
            );
            due = last == null || availableBoundary > last;
          }
          if (!due) return;
          const succeeded = await onDue(
            scheduled.strategyId,
            scheduled.tickers,
            checkInterval,
            requiredCycleAt,
          );
          if (succeeded) {
            lastFiredBySchedule.set(scheduleKey, Date.parse(requiredCycleAt));
          }
        };
        void tick();
        return setInterval(() => void tick(), Math.min(pollMs, 60_000));
      });
    },
    stop: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = [];
    },
  };
}
