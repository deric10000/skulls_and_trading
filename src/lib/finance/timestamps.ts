/**
 * Fill timestamps for qty edits.
 *
 * MOCK: floor "now" to the prior 15-minute America/New_York candle close so the
 * stamp matches how live quotes will be bucketed later.
 * LIVE (later): replace `estimateFillTimestamp` with the provider's candle
 * close for the active bar — keep the ISO shape + EST display helpers.
 */

const TZ = "America/New_York";

function partsInTimeZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return bag;
}

/** Floor to :00 / :15 / :30 / :45 in America/New_York; seconds → 0. */
export function floorToFifteenMinuteCandle(date: Date = new Date()): Date {
  const p = partsInTimeZone(date, TZ);
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  let hour = Number(p.hour === "24" ? "0" : p.hour);
  const minute = Number(p.minute);
  const flooredMinute = Math.floor(minute / 15) * 15;

  // Build an ISO in EST/EDT by formatting a UTC guess then adjusting — use
  // the offset from a Date constructed via temporal-less locale trick:
  const asLocalGuess = new Date(
    Date.UTC(year, month - 1, day, hour, flooredMinute, 0),
  );
  // Diff between the UTC-as-components interpretation and the intended NY wall time.
  const mirror = partsInTimeZone(asLocalGuess, TZ);
  const mirrorHour = Number(mirror.hour === "24" ? "0" : mirror.hour);
  const mirrorDay = Number(mirror.day);
  let driftHours = hour - mirrorHour;
  if (mirrorDay !== day) {
    // crossed a day boundary in the mirror — coarse adjust
    driftHours += mirrorDay > day ? -24 : 24;
  }
  return new Date(asLocalGuess.getTime() + driftHours * 60 * 60 * 1000);
}

export function estimateFillTimestamp(now: Date = new Date()): string {
  return floorToFifteenMinuteCandle(now).toISOString();
}

/** e.g. "11:15 AM EDT" for review UI. */
export function formatFillTimestampEst(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}
