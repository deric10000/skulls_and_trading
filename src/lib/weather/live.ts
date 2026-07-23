/**
 * Live Market Weather from FreeTier `MarketContext` (FRED + index ETFs via Worker).
 * Does not invent micro-layer fundamentals — market score drives the cascade;
 * sector/industry/stock layers tilt slightly from taxonomy until paid feeds land.
 */

import { TICKERS } from "../../data";
import type { MarketContext } from "../../types";
import { buildReading } from "./scoring";
import {
  assertTickerTaxonomy,
  industries,
  industrySectorMap,
  industryTiltOffset,
  sectors,
} from "./taxonomy";
import type {
  MarketWeatherSnapshot,
  MarketWeatherTimeframe,
  WeatherLayerReading,
  WeatherSubScores,
} from "./types";

const clamp = (n: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Math.round(n * 100) / 100));

/** Map plan-safe MarketContext fields into 0–100 weather instruments. */
export function subScoresFromMarketContext(ctx: MarketContext): WeatherSubScores {
  const vix = typeof ctx.vix === "number" ? ctx.vix : 20;
  // Higher VIX → lower "calm" volatility score.
  const volatility = clamp(100 - (vix - 10) * 2.8);
  const spyRsi = typeof ctx.spyRsi === "number" ? ctx.spyRsi : 50;
  const trend = clamp(spyRsi);
  const spy5d = typeof ctx.spy5dChangePct === "number" ? ctx.spy5dChangePct : 0;
  const breadth = clamp(50 + spy5d * 4);
  const riskAppetite = clamp(volatility * 0.55 + breadth * 0.45);
  const hy =
    typeof ctx.highYieldSpreadPct === "number" ? ctx.highYieldSpreadPct : null;
  const rotation = hy == null ? 50 : clamp(80 - (hy - 3) * 12);
  return { trend, breadth, volatility, riskAppetite, rotation };
}

function climateFromContext(ctx: MarketContext): {
  priceVs200DayMA: number;
  distanceFrom200DayMA: number;
} {
  if (ctx.spyAbove200dSma === 1) {
    return { priceVs200DayMA: 72, distanceFrom200DayMA: 4 };
  }
  if (ctx.spyAbove200dSma === 0) {
    return { priceVs200DayMA: 28, distanceFrom200DayMA: -4 };
  }
  return { priceVs200DayMA: 50, distanceFrom200DayMA: 0 };
}

function tilt(
  base: WeatherSubScores,
  delta: number,
): WeatherSubScores {
  return {
    trend: clamp(base.trend + delta),
    breadth: clamp(base.breadth + delta * 0.8),
    volatility: clamp(base.volatility + delta * 0.3),
    riskAppetite: clamp(base.riskAppetite + delta * 0.5),
    rotation: clamp(base.rotation + delta * 0.4),
  };
}

/** Soft tilts until real sector RS ships — keyed by GICS sector names. */
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

/**
 * Build one session snapshot from live MarketContext. Cached by caller/freeTier.
 */
export function buildLiveWeatherSnapshot(
  timeframe: MarketWeatherTimeframe,
  ctx: MarketContext,
): MarketWeatherSnapshot {
  assertTickerTaxonomy();
  const generatedAt = ctx.asOf
    ? `${ctx.asOf}T16:00:00.000Z`
    : new Date().toISOString();
  const marketSub = subScoresFromMarketContext(ctx);
  const climate = climateFromContext(ctx);
  const industrySectors = industrySectorMap();
  const sectorNames = sectors();

  const market = buildReading({
    layer: "market",
    label: "Market",
    timeframe,
    subScores: marketSub,
    priceVs200DayMA: climate.priceVs200DayMA,
    distanceFrom200DayMA: climate.distanceFrom200DayMA,
    lastUpdated: generatedAt,
  });

  const sectorsOut: Record<string, WeatherLayerReading> = {};
  for (const name of sectorNames) {
    const delta = SECTOR_TILT[name] ?? 0;
    sectorsOut[name] = buildReading({
      layer: "sector",
      label: name,
      timeframe,
      subScores: tilt(marketSub, delta),
      priceVs200DayMA: climate.priceVs200DayMA + delta,
      distanceFrom200DayMA: climate.distanceFrom200DayMA,
      classify: { higherLayerScore: market.score },
      lastUpdated: generatedAt,
    });
  }

  const industriesOut: Record<string, WeatherLayerReading> = {};
  for (const name of industries()) {
    const sector = industrySectors[name];
    const parent = sectorsOut[sector];
    const delta =
      (SECTOR_TILT[sector] ?? 0) + 2 + industryTiltOffset(name);
    industriesOut[name] = buildReading({
      layer: "industry",
      label: name,
      timeframe,
      subScores: tilt(marketSub, delta),
      priceVs200DayMA: climate.priceVs200DayMA,
      distanceFrom200DayMA: climate.distanceFrom200DayMA,
      classify: { higherLayerScore: parent?.score },
      lastUpdated: generatedAt,
    });
  }

  const stocks: Record<string, WeatherLayerReading> = {};
  for (const [ticker, info] of Object.entries(TICKERS)) {
    if (!info.sector || !info.industry) continue;
    stocks[ticker] = buildStockReading({
      ticker,
      sector: info.sector,
      industry: info.industry,
      marketSub,
      climate,
      industriesOut,
      sectorsOut,
      timeframe,
      generatedAt,
    });
  }

  return {
    timeframe,
    generatedAt,
    market,
    sectors: sectorsOut,
    industries: industriesOut,
    stocks,
    industrySectors,
  };
}

/** One stock-layer reading — cascade tilt from industry → sector → market. */
export function buildStockReading(args: {
  ticker: string;
  sector?: string | null;
  industry?: string | null;
  marketSub: WeatherSubScores;
  climate: { priceVs200DayMA: number; distanceFrom200DayMA: number };
  industriesOut: Record<string, WeatherLayerReading>;
  sectorsOut: Record<string, WeatherLayerReading>;
  timeframe: MarketWeatherTimeframe;
  generatedAt: string;
}): WeatherLayerReading {
  const industry = args.industry ?? null;
  const sector = args.sector ?? null;
  const parentIndustry = industry ? args.industriesOut[industry] : undefined;
  const parentSector = sector ? args.sectorsOut[sector] : undefined;
  // No taxonomy → still readable weather: market instruments with a tiny
  // stock-layer offset (same Free-tier cascade; no per-ticker Yahoo).
  const delta = sector != null ? (SECTOR_TILT[sector] ?? 0) - 1 : -1;
  return buildReading({
    layer: "stock",
    label: args.ticker,
    timeframe: args.timeframe,
    subScores: tilt(args.marketSub, delta),
    priceVs200DayMA: args.climate.priceVs200DayMA,
    distanceFrom200DayMA: args.climate.distanceFrom200DayMA,
    classify: {
      higherLayerScore:
        parentIndustry?.score ?? parentSector?.score ?? undefined,
    },
    lastUpdated: args.generatedAt,
  });
}

/**
 * Ensure every listed watch ticker has a stock reading.
 * Pure client math on the existing MarketContext cascade — no Yahoo calls.
 * Sector/industry refine the tilt when known; missing taxonomy still yields
 * a market-based stock reading.
 */
export function augmentWeatherStocks(
  snapshot: MarketWeatherSnapshot,
  ctx: MarketContext,
  tickers: Array<{
    ticker: string;
    sector?: string | null;
    industry?: string | null;
  }>,
): MarketWeatherSnapshot {
  if (tickers.length === 0) return snapshot;
  const marketSub = snapshot.market.subScores;
  const climate = climateFromContext(ctx);
  const stocks = { ...snapshot.stocks };
  let changed = false;
  for (const row of tickers) {
    const key = row.ticker.toUpperCase();
    if (stocks[key]) continue;
    const sector =
      row.sector && snapshot.sectors[row.sector] ? row.sector : null;
    const industry =
      row.industry && snapshot.industries[row.industry] ? row.industry : null;
    stocks[key] = buildStockReading({
      ticker: key,
      sector,
      industry,
      marketSub,
      climate,
      industriesOut: snapshot.industries,
      sectorsOut: snapshot.sectors,
      timeframe: snapshot.timeframe,
      generatedAt: snapshot.generatedAt,
    });
    changed = true;
  }
  return changed ? { ...snapshot, stocks } : snapshot;
}
