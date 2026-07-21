import { TICKERS } from "../../data";
import { buildReading, type ClassifyContext } from "./scoring";
import {
  assertTickerTaxonomy,
  industries,
  industrySectorMap,
  industryTiltOffset,
  sectors,
} from "./taxonomy";
import type {
  MarketWeatherLayer,
  MarketWeatherSnapshot,
  MarketWeatherTimeframe,
  WeatherLayerReading,
  WeatherSubScores,
} from "./types";

// ---------------------------------------------------------------------------
// MOCK weather data.
//
// >>> FUTURE API WIRING <<<
// Replace this file with real provider calls. The contract a provider must meet:
// build ONE MarketWeatherSnapshot per session (premarket/live/afterhours) that
// covers EVERY GICS sector and industry (+ tracked stocks) — fetched once,
// cached app-wide, then filtered per user on the client. Taxonomy keys come
// from weather/taxonomy.ts (not from TICKERS). Feed each entity's normalized
// sub-scores + climate inputs into buildReading() exactly as below; the scoring
// engine and UI stay unchanged.
// ---------------------------------------------------------------------------

interface WeatherSeed {
  subScores: WeatherSubScores;
  priceVs200DayMA: number; // 0–100 (climate context only)
  distanceFrom200DayMA: number; // signed % distance
  /** Stable signals applied in every session. */
  classify?: ClassifyContext;
  /** Special-event signals applied only in the LIVE session (real tape). */
  liveClassify?: ClassifyContext;
}

const MARKET_SEED: WeatherSeed = {
  subScores: { trend: 72, breadth: 66, volatility: 62, riskAppetite: 64, rotation: 60 },
  priceVs200DayMA: 80,
  distanceFrom200DayMA: 6,
};

/** Authored sector seeds (GICS keys). Missing sectors inherit from market + tilt. */
const SECTOR_SEEDS: Record<string, WeatherSeed> = {
  "Information Technology": {
    subScores: { trend: 70, breadth: 62, volatility: 58, riskAppetite: 62, rotation: 74 },
    priceVs200DayMA: 82,
    distanceFrom200DayMA: 8,
    classify: { relativeStrength: 76, rsImproving: true },
  },
  Financials: {
    subScores: { trend: 58, breadth: 55, volatility: 54, riskAppetite: 56, rotation: 52 },
    priceVs200DayMA: 64,
    distanceFrom200DayMA: 4,
  },
  Industrials: {
    subScores: { trend: 52, breadth: 44, volatility: 50, riskAppetite: 48, rotation: 46 },
    priceVs200DayMA: 55,
    distanceFrom200DayMA: 3,
  },
  "Consumer Staples": {
    subScores: { trend: 50, breadth: 52, volatility: 70, riskAppetite: 58, rotation: 56 },
    priceVs200DayMA: 52,
    distanceFrom200DayMA: 1.5,
  },
  "Consumer Discretionary": {
    subScores: { trend: 48, breadth: 40, volatility: 44, riskAppetite: 42, rotation: 40 },
    priceVs200DayMA: 40,
    distanceFrom200DayMA: -4,
  },
};

const SECTOR_TILT: Record<string, number> = {
  Energy: -1,
  Materials: -1,
  Industrials: -2,
  "Consumer Discretionary": -4,
  "Consumer Staples": 1,
  "Health Care": 1,
  Financials: 0,
  "Information Technology": 6,
  "Communication Services": 2,
  Utilities: 0,
  "Real Estate": -1,
};

/** Authored industry seeds (GICS keys). Missing industries inherit parent + offset. */
const INDUSTRY_SEEDS: Record<string, WeatherSeed> = {
  "Semiconductors & Semiconductor Equipment": {
    subScores: { trend: 74, breadth: 64, volatility: 58, riskAppetite: 64, rotation: 62 },
    priceVs200DayMA: 86,
    distanceFrom200DayMA: 11,
    liveClassify: { volumeRatio: 1.35, breakingResistance: true },
  },
  Software: {
    subScores: { trend: 60, breadth: 56, volatility: 56, riskAppetite: 56, rotation: 50 },
    priceVs200DayMA: 70,
    distanceFrom200DayMA: 5,
  },
  "IT Services": {
    subScores: { trend: 68, breadth: 60, volatility: 56, riskAppetite: 60, rotation: 72 },
    priceVs200DayMA: 78,
    distanceFrom200DayMA: 7,
    classify: { relativeStrength: 73, rsImproving: true },
  },
  "Financial Services": {
    subScores: { trend: 54, breadth: 48, volatility: 50, riskAppetite: 52, rotation: 48 },
    priceVs200DayMA: 58,
    distanceFrom200DayMA: 3,
  },
  "Aerospace & Defense": {
    subScores: { trend: 46, breadth: 38, volatility: 44, riskAppetite: 42, rotation: 40 },
    priceVs200DayMA: 38,
    distanceFrom200DayMA: -6,
  },
  Beverages: {
    subScores: { trend: 49, breadth: 50, volatility: 70, riskAppetite: 58, rotation: 56 },
    priceVs200DayMA: 53,
    distanceFrom200DayMA: 2.5,
  },
  "Personal Care Products": {
    subScores: { trend: 58, breadth: 54, volatility: 54, riskAppetite: 54, rotation: 50 },
    priceVs200DayMA: 62,
    distanceFrom200DayMA: 5,
  },
};

const STOCK_SEEDS: Record<string, WeatherSeed> = {
  NVDA: {
    subScores: { trend: 74, breadth: 62, volatility: 58, riskAppetite: 64, rotation: 64 },
    priceVs200DayMA: 88,
    distanceFrom200DayMA: 12,
    liveClassify: { volumeRatio: 1.4, breakingResistance: true },
  },
  MSFT: {
    subScores: { trend: 60, breadth: 56, volatility: 60, riskAppetite: 56, rotation: 50 },
    priceVs200DayMA: 72,
    distanceFrom200DayMA: 5,
  },
  CRM: {
    subScores: { trend: 40, breadth: 42, volatility: 38, riskAppetite: 44, rotation: 40 },
    priceVs200DayMA: 34,
    distanceFrom200DayMA: -8,
    classify: { scoreDeltaToday: -14 },
  },
  CRWV: {
    subScores: { trend: 46, breadth: 40, volatility: 44, riskAppetite: 46, rotation: 46 },
    priceVs200DayMA: 42,
    distanceFrom200DayMA: -3,
  },
  IONQ: {
    subScores: { trend: 62, breadth: 54, volatility: 50, riskAppetite: 60, rotation: 66 },
    priceVs200DayMA: 66,
    distanceFrom200DayMA: 6,
  },
  RGTI: {
    subScores: { trend: 32, breadth: 34, volatility: 32, riskAppetite: 38, rotation: 34 },
    priceVs200DayMA: 30,
    distanceFrom200DayMA: -10,
  },
  SOFI: {
    subScores: { trend: 58, breadth: 54, volatility: 52, riskAppetite: 56, rotation: 50 },
    priceVs200DayMA: 64,
    distanceFrom200DayMA: 4,
  },
  ACHR: {
    subScores: { trend: 50, breadth: 46, volatility: 48, riskAppetite: 48, rotation: 46 },
    priceVs200DayMA: 44,
    distanceFrom200DayMA: -2.5,
  },
  CELH: {
    subScores: { trend: 50, breadth: 52, volatility: 70, riskAppetite: 58, rotation: 56 },
    priceVs200DayMA: 51,
    distanceFrom200DayMA: 1.2,
  },
  ELF: {
    subScores: { trend: 58, breadth: 52, volatility: 56, riskAppetite: 54, rotation: 50 },
    priceVs200DayMA: 63,
    distanceFrom200DayMA: 5,
  },
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function sessionSubScores(
  base: WeatherSubScores,
  tf: MarketWeatherTimeframe,
): WeatherSubScores {
  if (tf === "live") return base;
  const pull = tf === "premarket" ? 0.18 : 0.1;
  const adjust = (v: number) => Math.round(clamp(v + (50 - v) * pull));
  return {
    trend: adjust(base.trend),
    breadth: adjust(base.breadth),
    volatility: adjust(base.volatility),
    riskAppetite: adjust(base.riskAppetite),
    rotation: adjust(base.rotation),
  };
}

function mergeClassify(
  seed: WeatherSeed,
  tf: MarketWeatherTimeframe,
  higherLayerScore?: number,
): ClassifyContext {
  return {
    ...seed.classify,
    ...(tf === "live" ? seed.liveClassify : {}),
    ...(higherLayerScore !== undefined ? { higherLayerScore } : {}),
  };
}

function readingFor(
  seed: WeatherSeed,
  layer: MarketWeatherLayer,
  label: string,
  tf: MarketWeatherTimeframe,
  generatedAt: string,
  higherLayerScore?: number,
): WeatherLayerReading {
  return buildReading({
    layer,
    label,
    timeframe: tf,
    subScores: sessionSubScores(seed.subScores, tf),
    priceVs200DayMA: seed.priceVs200DayMA,
    distanceFrom200DayMA: seed.distanceFrom200DayMA,
    classify: mergeClassify(seed, tf, higherLayerScore),
    lastUpdated: generatedAt,
  });
}

function inheritSectorSeed(name: string): WeatherSeed {
  const authored = SECTOR_SEEDS[name];
  if (authored) return authored;
  const delta = SECTOR_TILT[name] ?? 0;
  const adjust = (v: number) => clamp(v + delta);
  return {
    subScores: {
      trend: adjust(MARKET_SEED.subScores.trend),
      breadth: adjust(MARKET_SEED.subScores.breadth),
      volatility: adjust(MARKET_SEED.subScores.volatility),
      riskAppetite: adjust(MARKET_SEED.subScores.riskAppetite),
      rotation: adjust(MARKET_SEED.subScores.rotation),
    },
    priceVs200DayMA: clamp(MARKET_SEED.priceVs200DayMA + delta),
    distanceFrom200DayMA: MARKET_SEED.distanceFrom200DayMA,
  };
}

function inheritIndustrySeed(
  name: string,
  parentSeed: WeatherSeed,
): WeatherSeed {
  const authored = INDUSTRY_SEEDS[name];
  if (authored) return authored;
  const delta = 2 + industryTiltOffset(name);
  const adjust = (v: number) => clamp(v + delta);
  return {
    subScores: {
      trend: adjust(parentSeed.subScores.trend),
      breadth: adjust(parentSeed.subScores.breadth),
      volatility: adjust(parentSeed.subScores.volatility),
      riskAppetite: adjust(parentSeed.subScores.riskAppetite),
      rotation: adjust(parentSeed.subScores.rotation),
    },
    priceVs200DayMA: clamp(parentSeed.priceVs200DayMA + delta * 0.5),
    distanceFrom200DayMA: parentSeed.distanceFrom200DayMA,
  };
}

function buildSnapshot(tf: MarketWeatherTimeframe): MarketWeatherSnapshot {
  assertTickerTaxonomy();
  const generatedAt = new Date().toISOString();
  const industrySectors = industrySectorMap();

  const market = readingFor(MARKET_SEED, "market", "Market", tf, generatedAt);

  const sectorSeedByName: Record<string, WeatherSeed> = {};
  const sectorsOut: Record<string, WeatherLayerReading> = {};
  for (const name of sectors()) {
    const seed = inheritSectorSeed(name);
    sectorSeedByName[name] = seed;
    sectorsOut[name] = readingFor(
      seed,
      "sector",
      name,
      tf,
      generatedAt,
      market.score,
    );
  }

  const industriesOut: Record<string, WeatherLayerReading> = {};
  for (const name of industries()) {
    const sector = industrySectors[name];
    const parentSeed = sectorSeedByName[sector] ?? MARKET_SEED;
    const seed = inheritIndustrySeed(name, parentSeed);
    industriesOut[name] = readingFor(
      seed,
      "industry",
      name,
      tf,
      generatedAt,
      sectorsOut[sector]?.score,
    );
  }

  const stocks: Record<string, WeatherLayerReading> = {};
  for (const [ticker, seed] of Object.entries(STOCK_SEEDS)) {
    const industryName = TICKERS[ticker]?.industry;
    const parent = industryName ? industriesOut[industryName] : undefined;
    stocks[ticker] = readingFor(seed, "stock", ticker, tf, generatedAt, parent?.score);
  }

  return {
    timeframe: tf,
    generatedAt,
    market,
    sectors: sectorsOut,
    industries: industriesOut,
    stocks,
    industrySectors,
  };
}

// App-wide cache: one snapshot per session, computed once (mirrors the "one API
// call per session, shared across all users" requirement). The real API layer
// would populate/refresh this at each session boundary instead of recomputing.
const snapshotCache = new Map<MarketWeatherTimeframe, MarketWeatherSnapshot>();

export function getMarketWeatherSnapshot(
  tf: MarketWeatherTimeframe,
): MarketWeatherSnapshot {
  const cached = snapshotCache.get(tf);
  if (cached) return cached;
  const snapshot = buildSnapshot(tf);
  snapshotCache.set(tf, snapshot);
  return snapshot;
}
