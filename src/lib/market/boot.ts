import type { Portfolio, Strategy } from "../../types";

const inFlight = new Map<string, Promise<void>>();
const completed = new Set<string>();

/** Stable identity for the inputs that determine post-auth market bootstrap. */
export function marketBootFingerprint(
  portfolios: Portfolio[],
  strategies: Strategy[],
): string {
  const holdings = portfolios
    .flatMap((portfolio) =>
      portfolio.holdings.map(
        (holding) => `${portfolio.id}:${holding.ticker.trim().toUpperCase()}`,
      ),
    )
    .sort();
  const applied = strategies
    .filter((strategy) => (strategy.appliedPortfolioIds ?? []).length > 0)
    .map(
      (strategy) =>
        `${strategy.id}:${[...(strategy.appliedPortfolioIds ?? [])].sort().join(",")}`,
    )
    .sort();
  return JSON.stringify({ holdings, applied });
}

/**
 * One completed boot per stable session fingerprint. Concurrent React effects
 * share the same promise; explicit refresh/check actions remain unaffected.
 */
export function runMarketBootSingleFlight(
  fingerprint: string,
  run: () => Promise<void>,
): Promise<void> {
  if (completed.has(fingerprint)) return Promise.resolve();
  const existing = inFlight.get(fingerprint);
  if (existing) return existing;

  const next = run()
    .then(() => {
      completed.add(fingerprint);
    })
    .finally(() => {
      inFlight.delete(fingerprint);
    });
  inFlight.set(fingerprint, next);
  return next;
}

export function resetMarketBootGate(): void {
  inFlight.clear();
  completed.clear();
}

