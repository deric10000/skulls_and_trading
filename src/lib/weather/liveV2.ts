import type { MarketContext, TechnicalSnapshot, TimeframedIndicators } from "../../types";
import {
  getLiveMarketContext,
  getLiveQuote,
  getLiveTechnicals,
  getLiveTechnicalsByTimeframe,
  getLiveWeatherBenchmarks,
  getLiveWeatherSymbolObservable,
} from "../market/liveCache";
import { buildIndustryV2Reading } from "./industryV2Adapter";
import { buildMarketV2Reading } from "./marketV2Adapter";
import { buildAllSectorV2Readings } from "./sectorV2Adapter";
import type {
  WeatherV2Classification,
  WeatherV2Coverage,
  WeatherV2Pillars,
} from "./scoringV2Types";
import { buildStockV2Reading } from "./stockV2Adapter";
import {
  buildWeatherNarrative,
  buildWeatherSummary,
  type WeatherNarrativeFacts,
} from "./narrative";
import {
  GICS_INDUSTRIES,
  GICS_SECTORS,
  industrySectorMap,
} from "./taxonomy";
import type {
  MarketWeatherLayer,
  MarketWeatherSnapshot,
  MarketWeatherTimeframe,
  WeatherConditionId,
  WeatherEvidenceRow,
  WeatherLayerReading,
} from "./types";

const PILLAR_LABELS: Record<string, string> = {
  structure: "Structure",
  participation: "Participation",
  risk: "Risk",
  momentum: "Momentum",
  relativeStrength: "Relative strength",
};

const conditionId = (
  classification: WeatherV2Classification,
): WeatherConditionId =>
  classification.kind === "condition"
    ? classification.conditionId
    : "mixed-signals";

function evidenceRows(pillars: WeatherV2Pillars): WeatherEvidenceRow[] {
  return Object.entries(pillars).map(([key, value]) => ({
    label: PILLAR_LABELS[key] ?? key,
    value: `${Math.round(value!)}/100`,
    tone:
      value! >= 60
        ? "positive"
        : value! < 40
          ? "negative"
          : "neutral",
  }));
}

function toReading(args: {
  layer: MarketWeatherLayer;
  label: string;
  coverage: WeatherV2Coverage;
  classification: WeatherV2Classification;
  pillars: WeatherV2Pillars;
  weatherIndexScore: number | null;
  lastUpdated: string;
  narrativeFacts: WeatherNarrativeFacts;
}): WeatherLayerReading {
  const unavailable =
    args.classification.kind === "industry-unavailable" ||
    args.classification.kind === "insufficient";
  const id = conditionId(args.classification);
  const availableEvidence = evidenceRows(args.pillars);
  return {
    layer: args.layer,
    label: args.label,
    score: args.weatherIndexScore ?? 0,
    confidence:
      args.coverage === "complete"
        ? 90
        : args.coverage === "partial"
          ? 70
          : args.coverage === "provisional"
            ? 55
            : 0,
    conditionId: id,
    subScores: {
      trend: 0,
      breadth: 0,
      volatility: 0,
      riskAppetite: 0,
      rotation: 0,
    },
    summary: buildWeatherSummary({
      conditionId: id,
      layer: args.layer,
      label: args.label,
      coverage: args.coverage,
      facts: args.narrativeFacts,
    }),
    explanation: buildWeatherNarrative({
      conditionId: id,
      layer: args.layer,
      label: args.label,
      coverage: args.coverage,
      facts: args.narrativeFacts,
    }),
    why:
      availableEvidence.length > 0
        ? availableEvidence.map((row) => `${row.label} ${row.value}`).join(" · ")
        : "Independent evidence is not available for this layer.",
    climateContext: {
      position: "near",
      note: "Long-term context is included in Structure evidence.",
      confidenceAdjustment: 0,
    },
    dynamicGraphicKey: id,
    lastUpdated: args.lastUpdated,
    modelVersion: "v2",
    narrativeVersion: "v1",
    coverage: args.coverage,
    availability: unavailable ? "unavailable" : "available",
    ...(args.classification.kind === "industry-unavailable"
      ? {
          unavailableReason:
            "independent-industry-weather-unavailable" as const,
        }
      : {}),
    evidence: availableEvidence,
    pillarScores: Object.fromEntries(
      Object.entries(args.pillars).map(([key, value]) => [
        key,
        Math.round(value!),
      ]),
    ),
  };
}

export function buildLiveV2WeatherSnapshot(
  timeframe: MarketWeatherTimeframe,
  context: MarketContext | null | undefined = getLiveMarketContext(),
): MarketWeatherSnapshot {
  const weather = getLiveWeatherBenchmarks();
  const generatedAt =
    weather?.completedAt ?? context?.asOf ?? new Date().toISOString();
  const marketV2 = buildMarketV2Reading(context, weather);
  const market = toReading({
    layer: "market",
    label: "Market",
    coverage: marketV2.coverage,
    classification: marketV2.condition,
    pillars: marketV2.pillars,
    weatherIndexScore: marketV2.weatherIndexScore,
    lastUpdated: generatedAt,
    narrativeFacts: marketV2.narrativeFacts,
  });
  const sectors: Record<string, WeatherLayerReading> = {};
  for (const sector of buildAllSectorV2Readings(weather, {
    higherLayerIndex: marketV2.weatherIndex ?? undefined,
  })) {
    const label = sector.sector ?? "Sector";
    sectors[label] = toReading({
      layer: "sector",
      label,
      coverage: sector.coverage,
      classification: sector.condition,
      pillars: sector.pillars,
      weatherIndexScore: sector.weatherIndexScore,
      lastUpdated: generatedAt,
      narrativeFacts: sector.narrativeFacts,
    });
  }
  const industries: Record<string, WeatherLayerReading> = {};
  for (const item of GICS_INDUSTRIES) {
    const industry = buildIndustryV2Reading(item.name, weather, {
      higherLayerIndex: sectors[item.sector]?.score,
    });
    const reading = toReading({
      layer: "industry",
      label: item.name,
      coverage: industry.coverage,
      classification: industry.condition,
      pillars: industry.pillars,
      weatherIndexScore: industry.weatherIndexScore,
      lastUpdated: generatedAt,
      narrativeFacts: industry.narrativeFacts,
    });
    const parentBackdrop = sectors[item.sector]?.conditionId;
    industries[item.name] = parentBackdrop
      ? {
          ...reading,
          conditionId: parentBackdrop,
          dynamicGraphicKey: parentBackdrop,
        }
      : reading;
  }
  return {
    timeframe,
    generatedAt,
    market,
    sectors,
    industries,
    stocks: {},
    industrySectors: industrySectorMap(),
  };
}

export function addLiveV2Stocks(
  snapshot: MarketWeatherSnapshot,
  tickers: Array<{ ticker: string; sector?: string | null }>,
): MarketWeatherSnapshot {
  const stocks = { ...snapshot.stocks };
  for (const row of tickers) {
    const ticker = row.ticker.toUpperCase();
    const technicals: TechnicalSnapshot | undefined = getLiveTechnicals(ticker);
    const dailyIndicators: TimeframedIndicators | undefined =
      getLiveTechnicalsByTimeframe(ticker)?.["1D"];
    const sectorIndex =
      row.sector && GICS_SECTORS.includes(row.sector as (typeof GICS_SECTORS)[number])
        ? snapshot.sectors[row.sector]?.score
        : undefined;
    const stock = buildStockV2Reading({
      ticker,
      price: getLiveQuote(ticker)?.lastPrice,
      technicals,
      dailyIndicators,
      observable: getLiveWeatherSymbolObservable(ticker),
      sectorWeatherIndex: sectorIndex,
    });
    stocks[ticker] = toReading({
      layer: "stock",
      label: ticker,
      coverage: stock.coverage,
      classification: stock.condition,
      pillars: stock.pillars,
      weatherIndexScore: stock.weatherIndexScore,
      lastUpdated: snapshot.generatedAt,
      narrativeFacts: stock.narrativeFacts,
    });
  }
  return { ...snapshot, stocks };
}
