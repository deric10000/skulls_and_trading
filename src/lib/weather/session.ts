import type { MarketWeatherTimeframe } from "./types";

// ---------------------------------------------------------------------------
// Market session detection. The app reads the user's clock, resolves it to US
// Eastern (NYSE) time, and picks the session whose weather to show:
//   • premarket  — overnight → 9:30 ET (futures / overnight / pre-market VWAP)
//   • live       — 9:30 → 16:00 ET (real-time tape)
//   • afterhours — 16:00 ET → close of day, weekends (next-session setup)
//
// Uses Intl with the America/New_York zone so DST is handled automatically with
// no extra dependency.
// ---------------------------------------------------------------------------

const REGULAR_OPEN_MIN = 9 * 60 + 30; // 09:30 ET
const REGULAR_CLOSE_MIN = 16 * 60; // 16:00 ET
const PREMARKET_OPEN_MIN = 4 * 60; // 04:00 ET

interface EasternParts {
  weekday: number; // 0 = Sun … 6 = Sat
  minutesSinceMidnight: number;
}

function easternParts(date: Date): EasternParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  // "24" can appear at midnight in some environments; normalize to 0.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    weekday: weekdayMap[get("weekday")] ?? 1,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/** Resolve the current (or given) time to a market session. */
export function getMarketSession(now: Date = new Date()): MarketWeatherTimeframe {
  const { weekday, minutesSinceMidnight } = easternParts(now);

  // Weekend → show the next-session setup (after-hours read).
  if (weekday === 0 || weekday === 6) return "afterhours";

  if (
    minutesSinceMidnight >= PREMARKET_OPEN_MIN &&
    minutesSinceMidnight < REGULAR_OPEN_MIN
  ) {
    return "premarket";
  }
  if (
    minutesSinceMidnight >= REGULAR_OPEN_MIN &&
    minutesSinceMidnight < REGULAR_CLOSE_MIN
  ) {
    return "live";
  }
  // 16:00 → next 04:00 ET (incl. overnight) → after-hours / next-session setup.
  return "afterhours";
}

export interface SessionMeta {
  id: MarketWeatherTimeframe;
  label: string;
  tag: string;
  /** What data this session reads (shown as supporting copy / dev reference). */
  basis: string;
}

export const SESSION_META: Record<MarketWeatherTimeframe, SessionMeta> = {
  premarket: {
    id: "premarket",
    label: "Pre-Market",
    tag: "Pre-market read",
    basis:
      "Pre-market VWAP if available, else previous close, pre-market high/low, futures, and overnight movement.",
  },
  live: {
    id: "live",
    label: "Live Market",
    tag: "Live read",
    basis:
      "Live VWAP, real-time price, volume, breadth, VIX, and sector/industry movement.",
  },
  afterhours: {
    id: "afterhours",
    label: "After-Hours",
    tag: "Next-session setup",
    basis:
      "Closing location, closing breadth, after-hours move, earnings/news reaction, futures reopen, and next-day calendar risk.",
  },
};
