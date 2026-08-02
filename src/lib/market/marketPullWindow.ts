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
const SESSION_EDGE_HOUR = 20;

/** Days until the next Sunday (0 when already Sunday). */
const DAYS_UNTIL_SUNDAY: Record<string, number> = {
  Sun: 0,
  Mon: 6,
  Tue: 5,
  Wed: 4,
  Thu: 3,
  Fri: 2,
  Sat: 1,
};

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

/** Convert an America/New_York wall clock to UTC millis. */
function etWallToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  let utc = Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0);
  for (let i = 0; i < 5; i += 1) {
    const clock = etClock(utc);
    const want = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(
      clock.year,
      clock.month - 1,
      clock.day,
      clock.hour,
      clock.minute,
    );
    const delta = want - got;
    if (delta === 0) return utc;
    utc += delta;
  }
  return utc;
}

function addEtCalendarDays(clock: EtClock, days: number): EtClock {
  const noon = etWallToUtcMs(clock.year, clock.month, clock.day, 12, 0);
  return etClock(noon + days * 24 * HOUR_MS);
}

/** Next Sun 20:00 ET strictly after `fromMs`. */
function nextSundayOvernightOpenMs(fromMs: number): number {
  const clock = etClock(fromMs);
  const days = DAYS_UNTIL_SUNDAY[clock.weekday] ?? 0;
  let target = addEtCalendarDays(clock, days);
  let openMs = etWallToUtcMs(
    target.year,
    target.month,
    target.day,
    SESSION_EDGE_HOUR,
    0,
  );
  if (openMs <= fromMs) {
    target = addEtCalendarDays(target, 7);
    openMs = etWallToUtcMs(
      target.year,
      target.month,
      target.day,
      SESSION_EDGE_HOUR,
      0,
    );
  }
  return openMs;
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
    return new Date(nextSundayOvernightOpenMs(nextHour)).toISOString();
  }
  return new Date(nextSundayOvernightOpenMs(nowMs)).toISOString();
}
