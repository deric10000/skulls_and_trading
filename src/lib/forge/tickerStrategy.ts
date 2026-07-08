import { DEFAULT_STRATEGIES } from "../../data";
import type { Portfolio, Strategy } from "../../types";

export function holdingUsesStrategy(
  holding: { strategyIds?: string[] },
  strategyId: string,
): boolean {
  return (holding.strategyIds ?? []).includes(strategyId);
}

export function isDefaultStrategyId(strategyId: string): boolean {
  return DEFAULT_STRATEGIES.some((strategy) => strategy.id === strategyId);
}

/**
 * Whether a strategy should score (or display chips for) a holding.
 * Seeded defaults: only when `holding.strategyIds` lists that strategy.
 * Custom/duplicated strategies: any holding in an applied portfolio until
 * per-ticker assignment UI lands.
 */
export function shouldScoreTickerWithStrategy(
  holding: { strategyIds?: string[] },
  strategyId: string,
): boolean {
  if (holdingUsesStrategy(holding, strategyId)) return true;
  return !isDefaultStrategyId(strategyId);
}

/** Strategies that apply to a ticker for Watch summary / Forge ticker chips. */
export function strategiesForTicker(
  ticker: string,
  portfolios: Portfolio[],
  strategies: Strategy[],
): Strategy[] {
  return strategies.filter((strategy) => {
    const appliedPortfolioIds = strategy.appliedPortfolioIds ?? [];
    if (appliedPortfolioIds.length === 0) return false;

    const relevantHoldings = portfolios.flatMap((portfolio) =>
      appliedPortfolioIds.includes(portfolio.id)
        ? portfolio.holdings.filter((holding) => holding.ticker === ticker)
        : [],
    );
    if (relevantHoldings.length === 0) return false;

    if (isDefaultStrategyId(strategy.id)) {
      return relevantHoldings.some((holding) =>
        holdingUsesStrategy(holding, strategy.id),
      );
    }
    return true;
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
      if (shouldScoreTickerWithStrategy(holding, strategy.id)) {
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
      shouldScoreTickerWithStrategy(holding, strategy.id),
  );
}
