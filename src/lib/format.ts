/** ET clock label for a check / cycle instant (same-day omits weekday+date). */
export function formatCheckTime(iso: string): string {
  const when = new Date(iso);
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const whenParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(when);
  const part = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const sameEtDay =
    part(nowParts, "year") === part(whenParts, "year") &&
    part(nowParts, "month") === part(whenParts, "month") &&
    part(nowParts, "day") === part(whenParts, "day");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: sameEtDay ? undefined : "short",
    month: sameEtDay ? undefined : "numeric",
    day: sameEtDay ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(when);
}

/** Completed-market observation cutoff; date-only inputs never shift across ET. */
export function formatMarketDataThrough(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return formatCheckTime(dateKey);
  const [, year, month, day] = match;
  const when = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  const currentEtYear = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
  }).format(new Date());
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(year === currentEtYear ? {} : { year: "numeric" as const }),
  }).format(when);
}

export function formatWeatherProvenance(args: {
  dataAsOf?: string;
  updatedAt: string;
  staleInputs?: string[];
}): string {
  const timing = args.dataAsOf
    ? `Market data through ${formatMarketDataThrough(args.dataAsOf)} close · Updated ${formatCheckTime(args.updatedAt)}`
    : `Updated ${formatCheckTime(args.updatedAt)}`;
  return args.staleInputs?.length
    ? `${timing} · Carried forward: ${args.staleInputs.join(", ")}`
    : timing;
}

/** mm:ss (or h:mm:ss) countdown shared by Current Watch + Market Weather. */
export function formatCheckCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatChange(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Display helper for scores / ratios / other continuous metrics — always 2 dp. */
export function formatDecimals(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

/** Round a number to `digits` decimal places (for scoring / bar widths). */
export function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
