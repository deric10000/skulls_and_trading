/**
 * Soft free-tier caps for Beta 0 (cron-batched hourly market cycles).
 * Chips are local evaluations; ticker count drives API cost.
 */

export const BETA0_MAX_TRACKED_TICKERS = 40;
export const BETA0_MAX_ACTIVE_CHIPS = 200;

export interface BudgetUsage {
  tickersUsed: number;
  tickersMax: number;
  chipsUsed: number;
  chipsMax: number;
  tickersRemaining: number;
  chipsRemaining: number;
}

export function countActiveChips(
  strategies: { rules?: { id: string }[] | undefined }[],
): number {
  return strategies.reduce(
    (sum, strategy) => sum + (strategy.rules?.length ?? 0),
    0,
  );
}

export function countTrackedTickers(
  portfolios: { holdings: { ticker: string }[] }[],
): number {
  const set = new Set<string>();
  for (const portfolio of portfolios) {
    for (const holding of portfolio.holdings) {
      set.add(holding.ticker.toUpperCase());
    }
  }
  return set.size;
}

export function getBudgetUsage(
  portfolios: { holdings: { ticker: string }[] }[],
  strategies: { rules?: { id: string }[] | undefined }[],
  opts?: { adminBypass?: boolean },
): BudgetUsage {
  const tickersUsed = countTrackedTickers(portfolios);
  const chipsUsed = countActiveChips(strategies);
  const tickersMax = opts?.adminBypass ? 10_000 : BETA0_MAX_TRACKED_TICKERS;
  const chipsMax = opts?.adminBypass ? 10_000 : BETA0_MAX_ACTIVE_CHIPS;
  return {
    tickersUsed,
    tickersMax,
    chipsUsed,
    chipsMax,
    tickersRemaining: Math.max(0, tickersMax - tickersUsed),
    chipsRemaining: Math.max(0, chipsMax - chipsUsed),
  };
}

export function canAddTicker(
  portfolios: { holdings: { ticker: string }[] }[],
  strategies: { rules?: { id: string }[] | undefined }[],
  opts?: { adminBypass?: boolean },
): boolean {
  const usage = getBudgetUsage(portfolios, strategies, opts);
  return usage.tickersRemaining > 0;
}

export function canAddChips(
  portfolios: { holdings: { ticker: string }[] }[],
  strategies: { rules?: { id: string }[] | undefined }[],
  additional: number,
  opts?: { adminBypass?: boolean },
): boolean {
  const usage = getBudgetUsage(portfolios, strategies, opts);
  return usage.chipsUsed + additional <= usage.chipsMax;
}
