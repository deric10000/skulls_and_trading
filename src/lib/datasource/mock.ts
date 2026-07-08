import {
  ALLOCATIONS,
  DEFAULT_BUCKETS,
  FUNDAMENTAL_SNAPSHOTS,
  INITIAL_WATCHLIST,
  LOG_ENTRIES,
  MARKET_CONTEXT,
  MARKET_FLOW,
  PORTFOLIOS,
  PORTFOLIO_METRICS,
  POSITIONS,
  RISK_RULES,
  TECHNICAL_SNAPSHOTS,
  TICKERS,
  TICKER_ANALYSIS,
  watchlistFromHoldings,
} from "../../data";
import { getMarketWeatherSnapshot } from "../weather/mock";
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
  getLogs: () => LOG_ENTRIES,
  getTickerAnalysis: (ticker) => TICKER_ANALYSIS[ticker],
  getTickerInfo: (ticker) => TICKERS[ticker],
  getPositions: () => POSITIONS,
  getAllocations: () => ALLOCATIONS,
  getRiskRules: () => RISK_RULES,
  getPortfolioMetrics: () => PORTFOLIO_METRICS,
  getMarketFlow: () => MARKET_FLOW,
  getMarketWeather: (timeframe) => getMarketWeatherSnapshot(timeframe),
  getFundamentals: (ticker) => FUNDAMENTAL_SNAPSHOTS[ticker],
  getTechnicals: (ticker) => TECHNICAL_SNAPSHOTS[ticker],
  getMarketContext: () => MARKET_CONTEXT,
  getBuckets: () => DEFAULT_BUCKETS,
};
