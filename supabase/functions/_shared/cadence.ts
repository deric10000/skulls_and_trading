import type { CheckInterval } from "../../../src/types.ts";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function etParts(date: Date): {
  minutes: number;
  weekday: string;
  month: string;
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
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
    weekday: read("weekday"),
    month: `${read("year")}-${read("month")}`,
  };
}

function nextWeekdayMonth(candidateMs: number): string {
  let next = candidateMs + DAY_MS;
  while (["Sat", "Sun"].includes(etParts(new Date(next)).weekday)) {
    next += DAY_MS;
  }
  return etParts(new Date(next)).month;
}

function matches(interval: CheckInterval, atMs: number): boolean {
  const parts = etParts(new Date(atMs));
  const weekday = !["Sat", "Sun"].includes(parts.weekday);
  const hour = Math.floor(parts.minutes / 60);
  switch (interval) {
    case "close-premarket":
      return weekday && parts.minutes === 9 * 60 + 30;
    case "close-regular":
      return weekday && parts.minutes === 16 * 60;
    case "close-afterhours":
      return weekday && parts.minutes === 20 * 60;
    case "close-overnight":
      return weekday && parts.minutes === 4 * 60;
    case "1h":
      return atMs % (60 * MINUTE_MS) === 0;
    case "2h":
      return parts.minutes % 60 === 0 && hour % 2 === 0;
    case "4h":
      return parts.minutes % 60 === 0 && hour % 4 === 0;
    case "1D":
      return weekday && parts.minutes === 16 * 60;
    case "1W":
      return parts.minutes === 16 * 60 && parts.weekday === "Fri";
    case "1M":
      return (
        weekday &&
        parts.minutes === 16 * 60 &&
        nextWeekdayMonth(atMs) !== parts.month
      );
    default:
      return false;
  }
}

export function nextCheckBoundary(
  interval: CheckInterval,
  afterIso: string,
): string {
  const after = Date.parse(afterIso);
  if (Number.isNaN(after)) throw new Error("Invalid cadence cursor");
  let cursor = Math.floor(after / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const limit = after + 45 * DAY_MS;
  while (cursor <= limit) {
    if (matches(interval, cursor)) return new Date(cursor).toISOString();
    cursor += MINUTE_MS;
  }
  throw new Error(`No ${interval} cadence boundary within 45 days`);
}
