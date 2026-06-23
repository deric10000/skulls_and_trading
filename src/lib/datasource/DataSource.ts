import type {
  Allocation,
  LogEntry,
  MarketFlowStep,
  Portfolio,
  PortfolioMetric,
  Position,
  RiskRule,
  StrategyAssignments,
  TickerAnalysis,
  TickerInfo,
  WatchlistItem,
} from "../../types";
import type { MarketWeatherSnapshot, MarketWeatherTimeframe } from "../weather/types";

// The single boundary between the app and its "live-ish" data — portfolios,
// holdings, quotes/analysis, logs, and the portfolio aggregates. Today this is
// backed by static mock data (MockDataSource); later an ApiDataSource can pull
// real-time market data and live brokerage positions WITHOUT touching consumers.
//
// Scope: only data that will eventually come from a market/brokerage feed lives
// here. Static configuration and reference content (strategy catalog, profile
// option lists, education cards, ships/badges, score copy) is intentionally NOT
// behind this seam — it is imported directly from `src/data.ts`.
//
// Methods are synchronous for now so the mock renders with zero loading state.
// When the first real API lands, this interface becomes async and loading/error
// handling is added in AppState only — the one place that owns app state.
export interface DataSource {
  /** Seed list for the app's editable watchlist (the default portfolio). */
  getInitialWatchlist(): WatchlistItem[];

  /** All portfolios/watchlists available to switch between. */
  getPortfolios(): Portfolio[];

  /** A portfolio's holdings mapped into the Current Watch view model. */
  getWatchlistForPortfolio(portfolioId: string): WatchlistItem[];

  /** Strategy assignments that drive the dashboard Strategy Check signal. */
  getDefaultAssignments(): StrategyAssignments;

  /** Captain's Log entries keyed by ticker. */
  getLogs(): Record<string, LogEntry[]>;

  /** Deep analysis for a single ticker (Stock Summary / watch detail). */
  getTickerAnalysis(ticker: string): TickerAnalysis | undefined;

  /** Company facts for a ticker (incl. its Market Weather sector/industry). */
  getTickerInfo(ticker: string): TickerInfo | undefined;

  /** Treasure Ledger positions (weight, P&L, plan label). */
  getPositions(): Position[];

  /** Allocation breakdown by theme. */
  getAllocations(): Allocation[];

  /** Risk guardrail rows for the ledger. */
  getRiskRules(): RiskRule[];

  /** Discipline-first portfolio metrics. */
  getPortfolioMetrics(): PortfolioMetric[];

  /** Market Weather (macro → micro) flow steps. */
  getMarketFlow(): MarketFlowStep[];

  /**
   * Market Weather snapshot for a session (premarket/live/afterhours). Covers
   * every sector, industry, and tracked stock so it can be filtered per user's
   * portfolio/watchlist client-side. A real provider fetches this ONCE per
   * session and caches it app-wide (see weather/mock.ts).
   */
  getMarketWeather(timeframe: MarketWeatherTimeframe): MarketWeatherSnapshot;
}
