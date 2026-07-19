/**
 * Refresh scheduler — dues per strategy cadence. Only strategies with the
 * cadence feature enabled (`cadenceEnabled` + `cadenceNotify.autoRefresh`) are
 * scheduled; checks still run at login / manual refresh regardless.
 *
 * Gates on tab visibility + US session windows. AppState wires onDue → live
 * refresh for that strategy's assigned tickers only, then pops the cadence toast.
 */

import type {
  CandleInterval,
  CheckInterval,
  Portfolio,
  SessionCloseInterval,
  Strategy,
} from "../../types";

const DAY_MS = 24 * 60 * 60_000;

/** Fixed-length candle sizes in ms. Session-closes are event-based (see below). */
export const INTERVAL_MS: Record<CandleInterval, number> = {
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
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
  "30m",
  "1h",
  "4h",
  "1D",
  "1W",
  "1M",
];

/** Enabled candle sizes for the Technicals dropdown (candle-only, no 15m). */
export const ENABLED_CANDLE: CandleInterval[] = [
  "30m",
  "1h",
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

/** Clamp check cadence to the nearest enabled option — 15m/unknown → safe default. */
export function clampCadenceInterval(interval?: CheckInterval): CheckInterval {
  if (!interval) return "1D";
  if (ENABLED_CADENCE.includes(interval)) return interval;
  if (interval === "15m") return "30m"; // disabled → nearest enabled candle
  return "1D";
}

/** Clamp a technicals candle size — session-close/15m/unknown → candle default. */
export function clampCandleInterval(interval?: CheckInterval): CandleInterval {
  if (interval && ENABLED_CANDLE.includes(interval as CandleInterval)) {
    return interval as CandleInterval;
  }
  if (interval === "15m") return "30m";
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
      if (!holding.strategyIds.includes(strategy.id)) continue;
      const t = holding.ticker.toUpperCase();
      if (excluded.has(t)) continue;
      tickers.add(t);
    }
  }
  return [...tickers];
}

/** Cadence auto-refresh is active only when the master + auto-refresh toggles are on. */
export function isCadenceAutoRefreshOn(strategy: Strategy): boolean {
  return Boolean(strategy.cadenceEnabled && strategy.cadenceNotify?.autoRefresh);
}

export function createRefreshScheduler(
  portfolios: Portfolio[],
  strategies: Strategy[],
  onDue: (strategyId: string, tickers: string[], interval: CheckInterval) => void,
): RefreshScheduler {
  const plan: StrategySchedule[] = strategies
    .filter(isCadenceAutoRefreshOn)
    .map((strategy) => {
      const checkInterval = clampCadenceInterval(strategy.checkInterval);
      return {
        strategyId: strategy.id,
        tickers: tickersForStrategy(strategy, portfolios),
        checkInterval,
        intervalMs: isSessionClose(checkInterval)
          ? DAY_MS
          : INTERVAL_MS[checkInterval],
      };
    })
    .filter((item) => item.tickers.length > 0);

  let timers: ReturnType<typeof setInterval>[] = [];
  const lastFire = new Map<string, number>();

  return {
    plan,
    start: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = plan.map((scheduled) => {
        const { checkInterval } = scheduled;
        const sessionClose = isSessionClose(checkInterval);
        const daily = checkInterval === "1D";
        const weeklyish = checkInterval === "1W" || checkInterval === "1M";
        // Event/day-based cadences poll on a coarse timer; sub-daily candles
        // poll at their own interval.
        const pollMs = sessionClose
          ? 5 * 60_000
          : daily || weeklyish
            ? 15 * 60_000
            : scheduled.intervalMs;

        return setInterval(() => {
          if (!isTabVisible()) return;
          const last = lastFire.get(scheduled.strategyId) ?? null;
          let due = false;
          if (sessionClose) {
            due = isSessionCloseDue(checkInterval, last);
          } else if (daily) {
            due = isDailyCloseDue(last);
          } else if (weeklyish) {
            due =
              isUsRegularMarketHours() &&
              (last == null || Date.now() - last >= scheduled.intervalMs);
          } else {
            if (!isUsRegularMarketHours()) return;
            due = last == null || Date.now() - last >= scheduled.intervalMs;
          }
          if (!due) return;
          lastFire.set(scheduled.strategyId, Date.now());
          onDue(scheduled.strategyId, scheduled.tickers, checkInterval);
        }, pollMs);
      });
    },
    stop: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = [];
    },
  };
}
