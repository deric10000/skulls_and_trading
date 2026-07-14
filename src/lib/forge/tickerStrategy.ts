import { DEFAULT_STRATEGIES } from "../../data";
import type { Portfolio, PortfolioHolding, Strategy } from "../../types";

export function holdingUsesStrategy(
  holding: { strategyIds?: string[] },
  strategyId: string,
): boolean {
  return (holding.strategyIds ?? []).includes(strategyId);
}

export function isDefaultStrategyId(strategyId: string): boolean {
  return DEFAULT_STRATEGIES.some((strategy) => strategy.id === strategyId);
}

/** Whether a ticker is enabled for this strategy in a portfolio (Forge Tickers tab). */
export function isTickerEnabledForStrategy(
  holding: Pick<PortfolioHolding, "ticker" | "strategyIds">,
  strategy: Strategy,
  portfolioId: string,
): boolean {
  if (holdingUsesStrategy(holding, strategy.id)) return true;
  if (isDefaultStrategyId(strategy.id)) return false;
  return !(strategy.tickerExclusions?.[portfolioId]?.includes(holding.ticker) ?? false);
}

/**
 * Whether a strategy should score (or display chips for) a holding.
 * Default strategies: explicit `holding.strategyIds`. Custom copies: all tickers
 * in an applied portfolio are on until excluded via `strategy.tickerExclusions`.
 */
export function shouldScoreTickerWithStrategy(
  holding: Pick<PortfolioHolding, "ticker" | "strategyIds">,
  strategy: Strategy,
  portfolioId: string,
): boolean {
  return isTickerEnabledForStrategy(holding, strategy, portfolioId);
}

/** Strategies that apply to a ticker across any portfolio (legacy / diagnostics).
 * Prefer `strategiesForHolding` when a portfolio is known so sources never leak. */
export {
  assertAppliedPortfoliosCoverHoldings,
  portfolioIdsReferencingStrategy,
  withPortfolioApplied,
} from "./appliedPortfolios";

export function strategiesForTicker(
  ticker: string,
  portfolios: Portfolio[],
  strategies: Strategy[],
): Strategy[] {
  return strategies.filter((strategy) => {
    const appliedPortfolioIds = strategy.appliedPortfolioIds ?? [];
    if (appliedPortfolioIds.length === 0) return false;

    for (const portfolio of portfolios) {
      if (!appliedPortfolioIds.includes(portfolio.id)) continue;
      const holding = portfolio.holdings.find((item) => item.ticker === ticker);
      if (!holding) continue;
      if (shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) {
        return true;
      }
    }
    return false;
  });
}

/** Tickers in applied portfolios that use this strategy (seed) or all tickers (custom). */
export function tickersForAppliedStrategy(
  strategy: Strategy,
  portfolios: Portfolio[],
): string[] {
  const appliedIds = new Set(strategy.appliedPortfolioIds ?? []);
  const tickers = new Set<string>();
  for (const portfolio of portfolios) {
    if (!appliedIds.has(portfolio.id)) continue;
    for (const holding of portfolio.holdings) {
      if (shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) {
        tickers.add(holding.ticker);
      }
    }
  }
  return Array.from(tickers).sort();
}

/** Whether a ticker has at least one applied strategy in this portfolio. */
export function tickerHasAssignedStrategy(
  ticker: string,
  portfolio: Portfolio,
  strategies: Strategy[],
): boolean {
  const holding = portfolio.holdings.find((item) => item.ticker === ticker);
  if (!holding) return false;
  return strategies.some(
    (strategy) =>
      (strategy.appliedPortfolioIds ?? []).includes(portfolio.id) &&
      shouldScoreTickerWithStrategy(holding, strategy, portfolio.id),
  );
}

/** Strategies actively assigned to a holding in this portfolio. */
export function strategiesForHolding(
  holding: PortfolioHolding,
  portfolioId: string,
  strategies: Strategy[],
): Strategy[] {
  return strategies
    .filter(
      (strategy) =>
        (strategy.appliedPortfolioIds ?? []).includes(portfolioId) &&
        shouldScoreTickerWithStrategy(holding, strategy, portfolioId),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** All holdings in a portfolio, sorted by ticker symbol. */
export function sortedPortfolioHoldings(portfolio: Portfolio): PortfolioHolding[] {
  return [...portfolio.holdings].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Enabled tickers per applied portfolio — used for Configure dirty/saved baselines. */
export function enabledTickersByAppliedPortfolio(
  strategy: Strategy,
  portfolios: Portfolio[],
): Record<string, string[]> {
  const appliedIds = new Set(strategy.appliedPortfolioIds ?? []);
  const result: Record<string, string[]> = {};
  for (const portfolio of portfolios) {
    if (!appliedIds.has(portfolio.id)) continue;
    result[portfolio.id] = sortedPortfolioHoldings(portfolio)
      .filter((holding) => isTickerEnabledForStrategy(holding, strategy, portfolio.id))
      .map((holding) => holding.ticker);
  }
  return result;
}
