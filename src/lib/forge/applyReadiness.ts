import type { Strategy } from "../../types";

/** Minimum bar before a strategy can apply to a portfolio (lighter than validateStrategy). */
export const APPLY_READINESS_MESSAGE =
  "In order for a strategy to apply to a portfolio, you must add at least one portfolio and one rule from any category.";

export function isStrategyApplyReady(strategy: Strategy): boolean {
  const hasPortfolio = (strategy.appliedPortfolioIds ?? []).length > 0;
  const hasRule = (strategy.rules ?? []).some((chip) => chip.enabled);
  return hasPortfolio && hasRule;
}
