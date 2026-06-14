export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatChange(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
