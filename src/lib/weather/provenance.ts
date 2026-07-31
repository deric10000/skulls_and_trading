/** Convert an upstream observation timestamp to its New York market-date key. */
export function weatherObservationDate(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Conservative shared market-date cutoff across the observations in a reading. */
export function earliestWeatherObservationDate(
  values: Array<string | null | undefined>,
): string | undefined {
  return values
    .map(weatherObservationDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
}
