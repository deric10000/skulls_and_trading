/**
 * Live Market Weather from FreeTier `MarketContext` (FRED + index ETFs via Worker).
 * Does not invent micro-layer fundamentals — market score drives the cascade;
 * sector/industry/stock layers tilt slightly from taxonomy until paid feeds land.
 */

import { TICKERS } from "../../data";
import type { MarketContext } from "../../types";
import { buildReading } from "./scoring";
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

/** Soft tilts until real sector RS ships — keyed by `TICKERS[].sector`. */
const SECTOR_TILT: Record<string, number> = {
  Technology: 6,
  Financials: 0,
  Industrials: -2,
  "Consumer Staples": 1,
  "Consumer Discretionary": -4,
};

/**
 * Industry → sector taxonomy from `TICKERS` (SSOT). Keeps Industry Weather
 * keys identical to stock cascade labels (ACHR → "Aerospace & eVTOL", etc.).
 */
function industrySectorsFromTickers(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const info of Object.values(TICKERS)) {
    if (info.industry && info.sector) map[info.industry] = info.sector;
  }
  return map;
}

function sectorsFromTickers(
  industrySectors: Record<string, string>,
): string[] {
  const names = new Set<string>();
  for (const info of Object.values(TICKERS)) {
    if (info.sector) names.add(info.sector);
  }
  for (const sector of Object.values(industrySectors)) names.add(sector);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Build one session snapshot from live MarketContext. Cached by caller/freeTier.
 */
export function buildLiveWeatherSnapshot(
  timeframe: MarketWeatherTimeframe,
  ctx: MarketContext,
): MarketWeatherSnapshot {
  const generatedAt = ctx.asOf
    ? `${ctx.asOf}T16:00:00.000Z`
    : new Date().toISOString();
  const marketSub = subScoresFromMarketContext(ctx);
  const climate = climateFromContext(ctx);
  const industrySectors = industrySectorsFromTickers();
  const sectorNames = sectorsFromTickers(industrySectors);

  const market = buildReading({
    layer: "market",
    label: "Market",
    timeframe,
    subScores: marketSub,
    priceVs200DayMA: climate.priceVs200DayMA,
    distanceFrom200DayMA: climate.distanceFrom200DayMA,
    lastUpdated: generatedAt,
  });

  const sectors: Record<string, WeatherLayerReading> = {};
  for (const name of sectorNames) {
    const delta = SECTOR_TILT[name] ?? 0;
    sectors[name] = buildReading({
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

  const industries: Record<string, WeatherLayerReading> = {};
  for (const [name, sector] of Object.entries(industrySectors)) {
    const parent = sectors[sector];
    const delta = (SECTOR_TILT[sector] ?? 0) + 2;
    industries[name] = buildReading({
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
    const industryName = info.industry;
    const parent = industryName ? industries[industryName] : undefined;
    const sector = info.sector;
    stocks[ticker] = buildReading({
      layer: "stock",
      label: ticker,
      timeframe,
      subScores: tilt(marketSub, (SECTOR_TILT[sector] ?? 0) - 1),
      priceVs200DayMA: climate.priceVs200DayMA,
      distanceFrom200DayMA: climate.distanceFrom200DayMA,
      classify: { higherLayerScore: parent?.score ?? sectors[sector]?.score },
      lastUpdated: generatedAt,
    });
  }

  return {
    timeframe,
    generatedAt,
    market,
    sectors,
    industries,
    stocks,
    industrySectors,
  };
}
