import {
  ALLOCATIONS,
  DEFAULT_ASSIGNMENTS,
  INITIAL_WATCHLIST,
  LOG_ENTRIES,
  MARKET_FLOW,
  PORTFOLIOS,
  PORTFOLIO_METRICS,
  POSITIONS,
  RISK_RULES,
  TICKER_ANALYSIS,
  watchlistFromHoldings,
} from "../../data";
import type { DataSource } from "./DataSource";

// Static mock implementation: returns the existing `src/data.ts` values exactly
// as-is (no derivation that would change displayed numbers). This is the default
// data source until a real ApiDataSource replaces it.
export const mockDataSource: DataSource = {
  getInitialWatchlist: () => INITIAL_WATCHLIST,
  getPortfolios: () => PORTFOLIOS,
  getWatchlistForPortfolio: (portfolioId) => {
    const portfolio = PORTFOLIOS.find((option) => option.id === portfolioId);
    return portfolio ? watchlistFromHoldings(portfolio.holdings) : [];
  },
  getDefaultAssignments: () => DEFAULT_ASSIGNMENTS,
  getLogs: () => LOG_ENTRIES,
  getTickerAnalysis: (ticker) => TICKER_ANALYSIS[ticker],
  getPositions: () => POSITIONS,
  getAllocations: () => ALLOCATIONS,
  getRiskRules: () => RISK_RULES,
  getPortfolioMetrics: () => PORTFOLIO_METRICS,
  getMarketFlow: () => MARKET_FLOW,
};
