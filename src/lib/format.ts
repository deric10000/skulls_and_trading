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
