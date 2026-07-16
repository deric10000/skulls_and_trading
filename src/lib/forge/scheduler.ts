/**
 * Refresh scheduler — dues per strategy cadence (Beta 0 floor: daily+).
 * Gates on tab visibility + US regular hours; AppState wires onDue → live refresh
 * for that strategy’s assigned tickers only.
 */

import type { CheckInterval, Portfolio, Strategy } from "../../types";

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

export interface StrategySchedule {
  strategyId: string;
  tickers: string[];
  checkInterval: CheckInterval;
  intervalMs: number;
}

export interface RefreshScheduler {
  plan: StrategySchedule[];
  start: () => void;
  stop: () => void;
}

/** US regular hours in ET approximated via America/New_York parts. */
export function isUsRegularMarketHours(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const mins = hour * 60 + minute;
  return mins >= 9 * 60 + 30 && mins <= 16 * 60;
}

/**
 * For daily cadence: due once after the prior ET regular close (16:00) when the
 * tab is open during the next regular session — poll every 15m and fire if
 * lastFire was before today's session open.
 */
export function isDailyCloseDue(lastFireAt: number | null, now = new Date()): boolean {
  if (!isUsRegularMarketHours(now)) return false;
  const et = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => et.find((p) => p.type === type)?.value ?? "";
  const dayKey = `${get("year")}-${get("month")}-${get("day")}`;
  if (lastFireAt != null) {
    const last = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(lastFireAt));
    const lastKey = `${last.find((p) => p.type === "year")?.value}-${last.find((p) => p.type === "month")?.value}-${last.find((p) => p.type === "day")?.value}`;
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

export function createRefreshScheduler(
  portfolios: Portfolio[],
  strategies: Strategy[],
  onDue: (strategyId: string, tickers: string[]) => void,
): RefreshScheduler {
  const plan: StrategySchedule[] = strategies
    .map((strategy) => {
      const checkInterval = clampCadenceInterval(strategy.checkInterval);
      return {
        strategyId: strategy.id,
        tickers: tickersForStrategy(strategy, portfolios),
        checkInterval,
        intervalMs: INTERVAL_MS[checkInterval],
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
        const pollMs =
          scheduled.checkInterval === "1D" ||
          scheduled.checkInterval === "1W" ||
          scheduled.checkInterval === "1M"
            ? 15 * 60_000
            : scheduled.intervalMs;

        return setInterval(() => {
          if (!isTabVisible()) return;
          if (scheduled.checkInterval === "1D") {
            if (!isDailyCloseDue(lastFire.get(scheduled.strategyId) ?? null)) {
              return;
            }
          } else if (!isUsRegularMarketHours()) {
            return;
          } else {
            const last = lastFire.get(scheduled.strategyId);
            if (last != null && Date.now() - last < scheduled.intervalMs) return;
          }
          lastFire.set(scheduled.strategyId, Date.now());
          onDue(scheduled.strategyId, scheduled.tickers);
        }, pollMs);
      });
    },
    stop: () => {
      timers.forEach((timer) => clearInterval(timer));
      timers = [];
    },
  };
}
