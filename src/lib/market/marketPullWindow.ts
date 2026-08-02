/**
 * US equity extended-session pull window (America/New_York):
 * - Sun 20:00 → Fri 20:00 (overnight open through after-hours close)
 * - Sat closed; Sun before 20:00 closed; Fri after 20:00 closed
 *
 * Keep in sync with worker/marketPullWindow.ts.
 */

const ET = "America/New_York";
const HOUR_MS = 60 * 60_000;
/** Friday close / Sunday overnight open (minutes from ET midnight). */
const SESSION_EDGE_MINUTE = 20 * 60;

type EtClock = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function etClock(timeMs: number): EtClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timeMs));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** True when Worker cron may shard/publish a market cycle. */
export function isMarketPullOpen(timeMs: number): boolean {
  const { weekday, hour, minute } = etClock(timeMs);
  const minutes = hour * 60 + minute;
  if (weekday === "Sat") return false;
  if (weekday === "Sun") return minutes >= SESSION_EDGE_MINUTE;
  if (weekday === "Fri") return minutes <= SESSION_EDGE_MINUTE;
  return true;
}

function findNextOpenMs(fromMs: number): number {
  let t = Math.floor(fromMs / 60_000) * 60_000;
  if (t < fromMs) t += 60_000;
  for (let i = 0; i < 8 * 24 * 60; i += 1, t += 60_000) {
    if (isMarketPullOpen(t)) return t;
  }
  return fromMs + HOUR_MS;
}

/**
 * Next instant a pull may start: next UTC hour while the window is open,
 * otherwise the next overnight open (Sun 20:00 ET).
 */
export function nextMarketPullAt(nowMs: number = Date.now()): string {
  if (isMarketPullOpen(nowMs)) {
    const nextHour = Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS;
    if (isMarketPullOpen(nextHour)) {
      return new Date(nextHour).toISOString();
    }
    return new Date(findNextOpenMs(nextHour)).toISOString();
  }
  return new Date(findNextOpenMs(nowMs)).toISOString();
}
