import type { DataSource } from "./DataSource";
import { mockDataSource } from "./mock";
import { mergeTechnicalsByTimeframe } from "../forge/timeframedFromLegacy";
import { sanitizeFundamentals } from "../forge/metricSanity";
import {
  getBootstrapName,
  getLiveFundamentals,
  getLiveMarketContext,
  getLiveQuote,
  getLiveTaxonomy,
  getLiveTechnicals,
  getLiveTechnicalsByTimeframe,
  getWeatherTaxonomyReadiness,
  registerBootstrapTickers,
} from "../market/liveCache";
import { fetchMarketSearch } from "../market/client";
import { reportTaxonomyGap } from "../userStore/taxonomyGaps";
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
 *
 * Weather V2 (`liveV2`) is loaded asynchronously via `preloadWeatherV2` so the
 * signed-out entry chunk does not pull scoring adapters / taxonomy trees
 * (performance-budget.md). AuthedApp must preload before Home weather reads.
 */

type LiveV2Module = typeof import("../weather/liveV2");

let liveV2: LiveV2Module | null = null;
let liveV2Load: Promise<LiveV2Module> | null = null;

let searchCache: { q: string; hits: { symbol: string; name: string }[] } | null =
  null;

const weatherCache = new Map<MarketWeatherTimeframe, MarketWeatherSnapshot>();

/** Load Weather V2 into a separate chunk; safe to call repeatedly. */
export function preloadWeatherV2(): Promise<LiveV2Module> {
  if (liveV2) return Promise.resolve(liveV2);
  liveV2Load ??= import("../weather/liveV2").then((mod) => {
    liveV2 = mod;
    weatherCache.clear();
    return mod;
  });
  return liveV2Load;
}

export function isWeatherV2Ready(): boolean {
  return liveV2 != null;
}

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

/** Sync placeholder until AuthedApp finishes `preloadWeatherV2`. */
function pendingWeatherSnapshot(
  timeframe: MarketWeatherTimeframe,
): MarketWeatherSnapshot {
  const lastUpdated = new Date().toISOString();
  const pending = {
    layer: "market" as const,
    label: "Market",
    score: 0,
    confidence: 0,
    conditionId: "mixed-signals" as const,
    subScores: {
      trend: 0,
      breadth: 0,
      volatility: 0,
      riskAppetite: 0,
      rotation: 0,
    },
    explanation:
      "Weather evidence is still loading for this session.",
    why: "Waiting for the Weather V2 module.",
    climateContext: {
      position: "near" as const,
      note: "Long-term context loads with Structure evidence.",
      confidenceAdjustment: 0,
    },
    dynamicGraphicKey: "mixed-signals" as const,
    lastUpdated,
    modelVersion: "v2" as const,
    coverage: "insufficient" as const,
    availability: "unavailable" as const,
  };
  return {
    timeframe,
    generatedAt: lastUpdated,
    market: pending,
    sectors: {},
    industries: {},
    stocks: {},
    industrySectors: {},
  };
}

function bootstrapTickerInfo(ticker: string): TickerInfo | undefined {
  const name = getBootstrapName(ticker);
  const live = getLiveQuote(ticker);
  // Live holdings may exist after reload without a search-hit name — still
  // surface a stub so Weather / Watch can resolve the symbol.
  if (!name && !live) return undefined;
  return {
    company: name ?? ticker.toUpperCase(),
    category: "Pending research",
    sector: null,
    industry: null,
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
    const seeded = mockDataSource.getTickerInfo(ticker);
    const info = seeded ?? bootstrapTickerInfo(ticker);
    if (!info) return undefined;
    const live = getLiveQuote(ticker);
    const tax = seeded ? null : getLiveTaxonomy(ticker);
    const sector = seeded?.sector ?? tax?.sector ?? null;
    const industry = seeded?.industry ?? tax?.industry ?? null;
    const readiness = seeded ? undefined : getWeatherTaxonomyReadiness(ticker);
    // Gap events only after a completed hard miss — never while pending/idle.
    if (
      !seeded &&
      (!sector || !industry) &&
      readiness?.status === "failed"
    ) {
      void reportTaxonomyGap({
        ticker,
        reason: tax?.providerSector || tax?.providerIndustry
          ? "unmapped_yahoo"
          : "missing_provider",
        yahooSector: tax?.providerSector,
        yahooIndustry: tax?.providerIndustry,
      });
    }
    // Live-only price: never dual-read mock lastPrice once FreeTier is bound.
    return {
      ...info,
      sector,
      industry,
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
    if (!liveV2) {
      void preloadWeatherV2();
      return pendingWeatherSnapshot(timeframe);
    }
    const ctx = getLiveMarketContext() ?? EMPTY_LIVE_CONTEXT;
    const snapshot = liveV2.buildLiveV2WeatherSnapshot(timeframe, ctx);
    weatherCache.set(timeframe, snapshot);
    return snapshot;
  },
  getFundamentals: (ticker) => {
    const live = getLiveFundamentals(ticker);
    if (!live) return emptyFundamentalShape();
    return sanitizeFundamentals(live);
  },
  getTechnicals: (ticker) => getLiveTechnicals(ticker) ?? emptyTechnicalShape(),
  getTechnicalsByTimeframe: (ticker) =>
    mergeTechnicalsByTimeframe(
      getLiveTechnicals(ticker) ?? emptyTechnicalShape(),
      getLiveTechnicalsByTimeframe(ticker),
    ),
  getMarketContext: () => getLiveMarketContext() ?? EMPTY_LIVE_CONTEXT,
  getBuckets: () => mockDataSource.getBuckets(),
  searchTickers: (query) => {
    const q = query.trim();
    if (q.length < 2) return [];
    if (searchCache && searchCache.q === q.toLowerCase()) return searchCache.hits;
    return searchCache?.hits ?? [];
  },
};

/**
 * Weather snapshot for a watch list: independent V2 layer evidence with a
 * stock reading for every watched name.
 */
export function getWatchMarketWeather(
  timeframe: MarketWeatherTimeframe,
  watchTickers: string[],
): MarketWeatherSnapshot {
  const base = freeTierDataSource.getMarketWeather(timeframe);
  if (!liveV2) return base;
  const extras: Array<{
    ticker: string;
    sector?: string | null;
    industry?: string | null;
  }> = [];
  for (const raw of watchTickers) {
    const ticker = raw.toUpperCase();
    if (base.stocks[ticker]) continue;
    const info = freeTierDataSource.getTickerInfo(ticker);
    extras.push({
      ticker,
      sector: info?.sector ?? null,
      industry: info?.industry ?? null,
    });
  }
  return liveV2.addLiveV2Stocks(base, extras);
}

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
