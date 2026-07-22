/**
 * Edit-mode paper cash ↔ qty simulation for Current Watch.
 * Buys spend lastPrice × Δshares; sells return the same. Pure — no I/O.
 */

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Net cash change from enter-edit share baselines to current drafts.
 * Positive = cash freed (sells); negative = cash spent (buys).
 */
export function qtyCashImpact(
  baseline: Record<string, number>,
  drafts: Record<string, number>,
  priceOf: (ticker: string) => number,
): number {
  let impact = 0;
  const tickers = new Set([
    ...Object.keys(baseline),
    ...Object.keys(drafts),
  ]);
  for (const ticker of tickers) {
    const before = baseline[ticker] ?? 0;
    const after = drafts[ticker] ?? before;
    const price = priceOf(ticker);
    if (!(price > 0)) continue;
    impact -= (after - before) * price;
  }
  return roundMoney(impact);
}

/** Working cash = enter-edit cash + qty impact + manual cash offset. */
export function simulatedEditCash(
  cashBaseline: number,
  qtyImpact: number,
  cashOffset: number,
): number {
  return Math.max(0, roundMoney(cashBaseline + qtyImpact + cashOffset));
}
