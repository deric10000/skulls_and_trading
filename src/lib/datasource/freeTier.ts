import type { DataSource } from "./DataSource";
import { mockDataSource } from "./mock";
import {
  getBootstrapName,
  getLiveFundamentals,
  getLiveMarketContext,
  getLiveQuote,
  getLiveTechnicals,
  registerBootstrapTickers,
} from "../market/liveCache";
import { fetchMarketSearch } from "../market/client";
import { buildLiveWeatherSnapshot } from "../weather/live";
import type { MarketContext, TickerInfo, FundamentalSnapshot, TechnicalSnapshot } from "../../types";
import type {
  MarketWeatherSnapshot,
  MarketWeatherTimeframe,
} from "../weather/types";

/**
 * Free-tier DataSource: static portfolio/config still from mock seeds; live
 * quote/fundy/techy/context/weather use Worker-filled liveCache only — no
 * mock dual-read for those fields. Search never blends TOP_SEARCH_TICKERS.
 *
 * AppState owns refreshing liveCache (Pass 2 loading / lastPull stamps).
 */
let searchCache: { q: string; hits: { symbol: string; name: string }[] } | null =
  null;

const weatherCache = new Map<MarketWeatherTimeframe, MarketWeatherSnapshot>();

/** Null-shaped live context before the first successful Worker pull. */
export const EMPTY_LIVE_CONTEXT: MarketContext = {
  vix: null,
  spyRsi: null,
  spyAbove200dSma: null,
  spy5dChangePct: null,
  highYieldSpreadPct: null,
  treasury10y5dChangePct: null,
  asOf: new Date().toISOString().slice(0, 10),
  source: "live",
};

function emptyFundamentalShape(): FundamentalSnapshot {
  return {
    revenueGrowthPct: null,
    epsGrowthPct: null,
    grossMarginPct: null,
    operatingMarginPct: null,
    netMarginPct: null,
    fcfMarginPct: null,
    returnOnEquityPct: null,
    operatingCashFlow: null,
    netIncome: null,
    epsTtm: null,
    peRatio: null,
    forwardPE: null,
    priceToSales: null,
    evToEbitda: null,
    debtToEquity: null,
    interestCoverage: null,
    currentRatio: null,
    dividendYieldPct: null,
    payoutRatioPct: null,
    dividendGrowth5yPct: null,
    buybackYieldPct: null,
    asOf: EMPTY_LIVE_CONTEXT.asOf,
    source: "live",
  };
}

function emptyTechnicalShape(): TechnicalSnapshot {
  return {
    priceAbove200dSma: null,
    priceAbove50dSma: null,
    priceAbove20dSma: null,
    rsi14: null,
    weeklyRsi: null,
    drawdownFrom52wHighPct: null,
    priceChange3mPct: null,
    relativeVolume: null,
    priceVsVwapPct: null,
    priceVs10EmaPct: null,
    priceVs20EmaPct: null,
    priceVs50EmaPct: null,
    daysUntilEarnings: null,
    atrPct14d: null,
    beta1y: null,
    avgDollarVolume20d: null,
    sectorEtf1mChangePct: null,
    asOf: EMPTY_LIVE_CONTEXT.asOf,
    source: "live",
  };
}

function bootstrapTickerInfo(ticker: string): TickerInfo | undefined {
  const name = getBootstrapName(ticker);
  if (!name) return undefined;
  const live = getLiveQuote(ticker);
  return {
    company: name,
    category: "Pending research",
    sector: "Information Technology",
    industry: "Software",
    lastPrice: live?.lastPrice ?? 0,
    priceAsOf: live?.asOf ?? EMPTY_LIVE_CONTEXT.asOf,
    analysis: {
      setupSummary: "Bootstrapped from live search — research pending.",
      thesis: "Assign a strategy and log a thesis before sizing up.",
      risk: "Unknown — no company fundamentals loaded yet.",
      catalyst: "Awaiting research.",
      signals: [],
      investorView: "Pending research.",
      traderView: "Pending research.",
    },
    logs: [],
  };
}

export const freeTierDataSource: DataSource = {
  getInitialWatchlist: () => mockDataSource.getInitialWatchlist(),
  getPortfolios: () => mockDataSource.getPortfolios(),
  getWatchlistForPortfolio: (id) => mockDataSource.getWatchlistForPortfolio(id),
  getLogs: () => mockDataSource.getLogs(),
  getTickerAnalysis: (ticker) =>
    mockDataSource.getTickerAnalysis(ticker) ??
    bootstrapTickerInfo(ticker)?.analysis,
  getTickerInfo: (ticker) => {
    const info =
      mockDataSource.getTickerInfo(ticker) ?? bootstrapTickerInfo(ticker);
    if (!info) return undefined;
    const live = getLiveQuote(ticker);
    // Live-only price: never dual-read mock lastPrice once FreeTier is bound.
    return {
      ...info,
      lastPrice: live?.lastPrice ?? 0,
      priceAsOf: live?.asOf ?? info.priceAsOf ?? EMPTY_LIVE_CONTEXT.asOf,
    };
  },
  getQuote: (ticker) => getLiveQuote(ticker),
  getPositions: () => mockDataSource.getPositions(),
  getAllocations: () => mockDataSource.getAllocations(),
  getRiskRules: () => mockDataSource.getRiskRules(),
  getPortfolioMetrics: () => mockDataSource.getPortfolioMetrics(),
  getMarketFlow: () => mockDataSource.getMarketFlow(),
  getMarketWeather: (timeframe) => {
    const cached = weatherCache.get(timeframe);
    if (cached) return cached;
    const ctx = getLiveMarketContext() ?? EMPTY_LIVE_CONTEXT;
    const snapshot = buildLiveWeatherSnapshot(timeframe, ctx);
    weatherCache.set(timeframe, snapshot);
    return snapshot;
  },
  getFundamentals: (ticker) =>
    getLiveFundamentals(ticker) ?? emptyFundamentalShape(),
  getTechnicals: (ticker) => getLiveTechnicals(ticker) ?? emptyTechnicalShape(),
  getMarketContext: () => getLiveMarketContext() ?? EMPTY_LIVE_CONTEXT,
  getBuckets: () => mockDataSource.getBuckets(),
  searchTickers: (query) => {
    const q = query.trim();
    if (q.length < 2) return [];
    if (searchCache && searchCache.q === q.toLowerCase()) return searchCache.hits;
    return searchCache?.hits ?? [];
  },
};

/** Invalidate weather session cache when live context refreshes. */
export function clearLiveWeatherCache(): void {
  weatherCache.clear();
}

/** Async live search — never merges mock TOP_SEARCH_TICKERS. */
export async function asyncSearchTickers(
  query: string,
): Promise<{ symbol: string; name: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const result = await fetchMarketSearch(q);
  const hits = result?.hits ?? [];
  searchCache = { q: q.toLowerCase(), hits };
  registerBootstrapTickers(hits);
  return hits;
}
