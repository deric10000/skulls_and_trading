import type {
  CheckInterval,
  SessionCloseInterval,
} from "../../types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ET_TIME_ZONE = "America/New_York";

/** US session-close boundaries, ET minutes-from-midnight. */
export const SESSION_CLOSE_ET_MINUTES: Record<SessionCloseInterval, number> = {
  "close-premarket": 9 * 60 + 30,
  "close-regular": 16 * 60,
  "close-afterhours": 20 * 60,
  "close-overnight": 4 * 60,
};

export interface EtCalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly dayKey: string;
  readonly weekday: number;
}

interface EtLocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const ET_PARTS_CACHE_LIMIT = 512;
const etPartsByMinute = new Map<number, EtCalendarParts>();

export function getEtCalendarParts(date: Date): EtCalendarParts {
  const minuteKey = Math.floor(date.getTime() / MINUTE_MS);
  const cached = etPartsByMinute.get(minuteKey);
  if (cached) return cached;
  const values: Record<string, string> = {};
  for (const part of etFormatter.formatToParts(date)) {
    values[part.type] = part.value;
  }
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const result = Object.freeze({
    year,
    month,
    day,
    hour: Number(values.hour),
    minute: Number(values.minute),
    dayKey: `${values.year}-${values.month}-${values.day}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  });
  if (etPartsByMinute.size >= ET_PARTS_CACHE_LIMIT) {
    const oldest = etPartsByMinute.keys().next().value;
    if (oldest !== undefined) etPartsByMinute.delete(oldest);
  }
  etPartsByMinute.set(minuteKey, result);
  return result;
}

function localEpoch(parts: EtLocalDateTime): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
}

function localPartsAt(utcMs: number): EtLocalDateTime {
  const parts = getEtCalendarParts(new Date(utcMs));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function sameLocal(
  left: EtLocalDateTime,
  right: EtLocalDateTime,
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/**
 * Convert an ET wall-clock value to UTC without minute walking. Offset probes
 * on both sides of the wall cover EST/EDT transitions; nonexistent spring
 * times return null.
 */
function etLocalToUtcMs(parts: EtLocalDateTime): number | null {
  const wallMs = localEpoch(parts);
  const probes = [wallMs - 36 * HOUR_MS, wallMs, wallMs + 36 * HOUR_MS];
  const matches = new Set<number>();
  for (const probe of probes) {
    const offset = localEpoch(localPartsAt(probe)) - probe;
    const candidate = wallMs - offset;
    if (sameLocal(localPartsAt(candidate), parts)) matches.add(candidate);
  }
  if (matches.size === 0) return null;
  return Math.min(...matches);
}

function localDateFromEpoch(epochMs: number): EtLocalDateTime {
  const date = new Date(epochMs);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function addLocalDays(
  parts: EtLocalDateTime,
  days: number,
): EtLocalDateTime {
  return localDateFromEpoch(localEpoch(parts) + days * DAY_MS);
}

function localWeekday(parts: EtLocalDateTime): number {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
}

function isWeekday(parts: EtLocalDateTime): boolean {
  const weekday = localWeekday(parts);
  return weekday !== 0 && weekday !== 6;
}

function sessionInterval(
  interval: CheckInterval,
): interval is SessionCloseInterval {
  return interval.startsWith("close-");
}

function nextIntradayEtBoundary(
  hours: 2 | 4,
  fromMs: number,
): number {
  const current = getEtCalendarParts(new Date(fromMs));
  const currentLocalHour =
    localEpoch({ ...current, minute: 0 }) / HOUR_MS;
  let boundaryLocalHour =
    Math.floor(currentLocalHour / hours) * hours + hours;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = etLocalToUtcMs(
      localDateFromEpoch(boundaryLocalHour * HOUR_MS),
    );
    if (candidate != null && candidate > fromMs) return candidate;
    boundaryLocalHour += hours;
  }
  throw new Error(`Unable to resolve next ${hours}h ET cadence boundary`);
}

function latestIntradayEtBoundary(
  hours: 2 | 4,
  atMs: number,
): number {
  const current = getEtCalendarParts(new Date(atMs));
  const currentLocalHour =
    localEpoch({ ...current, minute: 0 }) / HOUR_MS;
  let boundaryLocalHour = Math.floor(currentLocalHour / hours) * hours;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = etLocalToUtcMs(
      localDateFromEpoch(boundaryLocalHour * HOUR_MS),
    );
    if (candidate != null && candidate <= atMs) return candidate;
    boundaryLocalHour -= hours;
  }
  throw new Error(`Unable to resolve latest ${hours}h ET cadence boundary`);
}

function nextWeekdayWall(
  fromMs: number,
  minuteOfDay: number,
): number {
  const current = getEtCalendarParts(new Date(fromMs));
  let local: EtLocalDateTime = {
    year: current.year,
    month: current.month,
    day: current.day,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (isWeekday(local)) {
      const candidate = etLocalToUtcMs(local);
      if (candidate != null && candidate > fromMs) return candidate;
    }
    local = addLocalDays(local, 1);
  }
  throw new Error("Unable to resolve next ET weekday boundary");
}

function latestWeekdayWall(
  atMs: number,
  minuteOfDay: number,
): number {
  const current = getEtCalendarParts(new Date(atMs));
  let local: EtLocalDateTime = {
    year: current.year,
    month: current.month,
    day: current.day,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (isWeekday(local)) {
      const candidate = etLocalToUtcMs(local);
      if (candidate != null && candidate <= atMs) return candidate;
    }
    local = addLocalDays(local, -1);
  }
  throw new Error("Unable to resolve latest ET weekday boundary");
}

function fridayWallNear(atMs: number, direction: "next" | "latest"): number {
  const current = getEtCalendarParts(new Date(atMs));
  const delta =
    direction === "next"
      ? (5 - current.weekday + 7) % 7
      : -((current.weekday - 5 + 7) % 7);
  let local: EtLocalDateTime = {
    ...addLocalDays(
      {
        year: current.year,
        month: current.month,
        day: current.day,
        hour: 16,
        minute: 0,
      },
      delta,
    ),
    hour: 16,
    minute: 0,
  };
  let candidate = etLocalToUtcMs(local);
  if (
    candidate == null ||
    (direction === "next" ? candidate <= atMs : candidate > atMs)
  ) {
    local = addLocalDays(local, direction === "next" ? 7 : -7);
    candidate = etLocalToUtcMs(local);
  }
  if (candidate == null) throw new Error("Unable to resolve ET Friday boundary");
  return candidate;
}

function monthEndWall(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let local: EtLocalDateTime = { year, month, day: lastDay, hour: 16, minute: 0 };
  while (!isWeekday(local)) local = addLocalDays(local, -1);
  const candidate = etLocalToUtcMs(local);
  if (candidate == null) throw new Error("Unable to resolve ET month-end boundary");
  return candidate;
}

function adjacentMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Next cadence wall strictly after `fromMs`. */
export function nextCadenceBoundaryMs(
  interval: CheckInterval,
  fromMs: number,
): number {
  if (interval === "1h" || interval === "15m" || interval === "30m") {
    return Math.floor(fromMs / HOUR_MS) * HOUR_MS + HOUR_MS;
  }
  if (interval === "2h" || interval === "4h") {
    return nextIntradayEtBoundary(interval === "2h" ? 2 : 4, fromMs);
  }
  if (sessionInterval(interval)) {
    return nextWeekdayWall(fromMs, SESSION_CLOSE_ET_MINUTES[interval]);
  }
  if (interval === "1D") return nextWeekdayWall(fromMs, 16 * 60);
  if (interval === "1W") return fridayWallNear(fromMs, "next");

  const current = getEtCalendarParts(new Date(fromMs));
  let candidate = monthEndWall(current.year, current.month);
  if (candidate <= fromMs) {
    const next = adjacentMonth(current.year, current.month, 1);
    candidate = monthEndWall(next.year, next.month);
  }
  return candidate;
}

/** Latest cadence wall at or before `atMs`. */
export function latestCadenceBoundaryMs(
  interval: CheckInterval,
  atMs: number,
): number {
  if (interval === "1h" || interval === "15m" || interval === "30m") {
    return Math.floor(atMs / HOUR_MS) * HOUR_MS;
  }
  if (interval === "2h" || interval === "4h") {
    return latestIntradayEtBoundary(interval === "2h" ? 2 : 4, atMs);
  }
  if (sessionInterval(interval)) {
    return latestWeekdayWall(atMs, SESSION_CLOSE_ET_MINUTES[interval]);
  }
  if (interval === "1D") return latestWeekdayWall(atMs, 16 * 60);
  if (interval === "1W") return fridayWallNear(atMs, "latest");

  const current = getEtCalendarParts(new Date(atMs));
  let candidate = monthEndWall(current.year, current.month);
  if (candidate > atMs) {
    const previous = adjacentMonth(current.year, current.month, -1);
    candidate = monthEndWall(previous.year, previous.month);
  }
  return candidate;
}
