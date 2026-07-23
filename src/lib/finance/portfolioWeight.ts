/**
 * Mark-based portfolio weight for Forge chips (position weightPct).
 * Returns undefined when the name or book has no usable last price — never
 * invent 0% (that falsely trips Add/Trim Zone floors).
 */

export function portfolioWeightPct(
  holdings: ReadonlyArray<{ ticker: string; shares: number }>,
  ticker: string,
  priceOf: (symbol: string) => number,
): number | undefined {
  const holding = holdings.find(
    (row) => row.ticker.toUpperCase() === ticker.toUpperCase(),
  );
  if (!holding || holding.shares <= 0) return undefined;

  const price = priceOf(holding.ticker);
  if (!(price > 0)) return undefined;

  let bookValue = 0;
  for (const row of holdings) {
    if (row.shares <= 0) continue;
    const mark = priceOf(row.ticker);
    if (mark > 0) bookValue += row.shares * mark;
  }
  if (bookValue <= 0) return undefined;

  return (holding.shares * price * 100) / bookValue;
}
