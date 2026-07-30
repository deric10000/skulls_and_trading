import type { WeatherBenchmarksPayload } from "../market/client";
import {
  classifyWeatherV2,
  computeCoverage,
  computeInstrumentRisk,
  computeMomentum,
  computeRelativeStrength,
  computeStructure,
  computeWeatherIndex,
} from "./scoringV2";
import type {
  WeatherV2Classification,
  WeatherV2Coverage,
  WeatherV2Pillars,
} from "./scoringV2Types";
import type { WeatherNarrativeFacts } from "./narrative";

/**
 * Product-owned Industry → ETF registry. V2 intentionally ships with no
 * unverified mappings: an Industry becomes independently readable only when a
 * fixed system ETF is approved and included in the Worker benchmark payload.
 */
export const INDUSTRY_TO_SYSTEM_ETF: Readonly<Record<string, string>> = {};

export interface IndustryV2Reading {
  industry: string;
  etf: string | null;
  coverage: WeatherV2Coverage;
  condition: WeatherV2Classification;
  pillars: WeatherV2Pillars;
  weatherIndex: number | null;
  weatherIndexScore: number | null;
  narrativeFacts: WeatherNarrativeFacts;
}

export function buildIndustryV2Reading(
  industry: string,
  weather: WeatherBenchmarksPayload | null | undefined,
  options: {
    industryEtfMap?: Readonly<Record<string, string>>;
    higherLayerIndex?: number;
  } = {},
): IndustryV2Reading {
  const etf = (options.industryEtfMap ?? INDUSTRY_TO_SYSTEM_ETF)[industry] ?? null;
  const obs = etf ? weather?.benchmarks[etf] : undefined;
  if (!etf || !obs) {
    return {
      industry,
      etf,
      coverage: "insufficient",
      condition: {
        kind: "industry-unavailable",
        coverage: "insufficient",
        reason: "independent-industry-weather-unavailable",
      },
      pillars: {},
      weatherIndex: null,
      weatherIndexScore: null,
      narrativeFacts: {},
    };
  }

  const structure = computeStructure({
    price: obs.price,
    atrPct: obs.atrPct,
    ema10: obs.ema10,
    ema20: obs.ema20,
    sma20: obs.sma20,
    sma50: obs.sma50,
    sma200: obs.sma200,
  });
  const relativeStrength = computeRelativeStrength({
    layer: "industry",
    rsVsSpy5d: obs.rsVsSpy5d,
    rsVsSpy20d: obs.rsVsSpy20d,
  });
  const risk = computeInstrumentRisk({
    atrPct14d: obs.atrPct,
    atrPctBaseline60d: obs.atrPctBaseline60d,
    drawdownFrom20dHighPct: obs.drawdownFrom20dHighPct,
  });
  const momentum = computeMomentum({
    rsi14: obs.rsi14,
    change5dPct: obs.return5dPct,
  });
  const pillars: WeatherV2Pillars = {
    ...(structure ? { structure: structure.value } : {}),
    ...(relativeStrength ? { relativeStrength: relativeStrength.value } : {}),
    ...(risk ? { risk: risk.value } : {}),
    ...(momentum ? { momentum: momentum.value } : {}),
  };
  const freshness =
    weather?.freshnessBySymbol?.[etf] ?? obs.freshness ?? "fresh";
  const coverage = computeCoverage({
    layer: "industry",
    hasInstrument: true,
    hasMinimumStructure: structure?.hasMinimumRelation === true,
    optionalInputMissing:
      freshness !== "fresh" ||
      structure?.partial === true ||
      relativeStrength?.partial === true ||
      risk?.partial === true ||
      momentum?.partial === true,
    allPreferredInputsFresh:
      freshness === "fresh" &&
      structure?.partial !== true &&
      relativeStrength != null &&
      risk != null &&
      momentum != null,
  });
  const index = computeWeatherIndex("industry", pillars);
  const condition =
    coverage === "insufficient" || !index
      ? ({ kind: "insufficient", coverage: "insufficient" } as const)
      : classifyWeatherV2({
          layer: "industry",
          coverage,
          pillars,
          weatherIndex: index.value,
          higherLayerIndex: options.higherLayerIndex,
          substantiallyBelowStructureRelation: structure?.relations.some(
            (relation) => relation.substantiallyBelow,
          ),
        });
  return {
    industry,
    etf,
    coverage,
    condition,
    pillars,
    weatherIndex: index?.value ?? null,
    weatherIndexScore: index?.score ?? null,
    narrativeFacts: {
      price: obs.price,
      ema10: obs.ema10,
      ema20: obs.ema20,
      sma50: obs.sma50,
      sma200: obs.sma200,
      rsi14: obs.rsi14,
      return5dPct: obs.return5dPct,
      rsVsSpy5d: obs.rsVsSpy5d,
      rsVsSpy20d: obs.rsVsSpy20d,
      volumeRatio: obs.volumeRatio,
      dailyRangeMultiple: obs.dailyRangeMultiple,
      absoluteReturnAtrMultiple: obs.absoluteReturnAtrMultiple,
      atrPct: obs.atrPct,
      atrPctBaseline60d: obs.atrPctBaseline60d,
      breakingResistance: obs.breakingResistance,
      lostSupport: obs.lostSupport,
      higherLayerIndex: options.higherLayerIndex,
    },
  };
}
