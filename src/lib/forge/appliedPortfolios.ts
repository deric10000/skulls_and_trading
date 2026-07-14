import type { Portfolio, Strategy } from "../../types";

/**
 * Every portfolio/watchlist whose holdings reference `strategyId` (via
 * `holdings[].strategyIds`). Pure — works on mock seed `PORTFOLIOS` now and on
 * API-fetched portfolios later. Prefer this over hand-maintained apply lists.
 */
export function portfolioIdsReferencingStrategy(
  portfolios: Portfolio[],
  strategyId: string,
): string[] {
  const ids: string[] = [];
  for (const portfolio of portfolios) {
    if (
      portfolio.holdings.some((holding) =>
        (holding.strategyIds ?? []).includes(strategyId),
      )
    ) {
      ids.push(portfolio.id);
    }
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

/**
 * Provider-agnostic invariant: every holdings[].strategyId must be covered by
 * that strategy's appliedPortfolioIds for the same source.
 */
export function assertAppliedPortfoliosCoverHoldings(
  portfolios: Portfolio[],
  strategies: Strategy[],
): void {
  const byId = new Map(strategies.map((strategy) => [strategy.id, strategy]));
  const failures: string[] = [];

  for (const portfolio of portfolios) {
    for (const holding of portfolio.holdings) {
      for (const strategyId of holding.strategyIds ?? []) {
        const strategy = byId.get(strategyId);
        if (!strategy) {
          failures.push(
            `${portfolio.id}/${holding.ticker}: unknown strategy "${strategyId}"`,
          );
          continue;
        }
        const applied = strategy.appliedPortfolioIds ?? [];
        if (!applied.includes(portfolio.id)) {
          failures.push(
            `${portfolio.id}/${holding.ticker}: strategy "${strategyId}" missing apply for this source`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Applied Portfolios invariant failed:\n- ${failures.join("\n- ")}`,
    );
  }
}

/** Ensure portfolioId is listed on strategy.appliedPortfolioIds (immutable). */
export function withPortfolioApplied(
  strategy: Strategy,
  portfolioId: string,
): Strategy {
  const applied = strategy.appliedPortfolioIds ?? [];
  if (applied.includes(portfolioId)) return strategy;
  return {
    ...strategy,
    appliedPortfolioIds: [...applied, portfolioId].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}
