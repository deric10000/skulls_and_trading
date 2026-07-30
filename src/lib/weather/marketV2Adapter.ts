import type { MarketContext } from "../../types";
import type { WeatherBenchmarksPayload } from "../market/client";
import {
  atrUnitDistance,
  classifyWeatherV2,
  computeCoverage,
  computeMarketParticipation,
  computeMarketRisk,
  computeMomentum,
  computeQqq200Support,
  computeStructure,
  computeWeatherIndex,
} from "./scoringV2";
import type {
  Qqq200Support,
  WeatherV2Classification,
  WeatherV2Coverage,
  WeatherV2PillarScore,
  WeatherV2Pillars,
} from "./scoringV2Types";
import type { WeatherNarrativeFacts } from "./narrative";

export interface MarketV2Reading {
  coverage: WeatherV2Coverage;
  condition: WeatherV2Classification;
  pillars: WeatherV2Pillars;
  pillarDetails: {
    structure: ReturnType<typeof computeStructure>;
    participation: WeatherV2PillarScore | null;
    risk: WeatherV2PillarScore | null;
    momentum: WeatherV2PillarScore | null;
  };
  weatherIndex: number | null;
  weatherIndexScore: number | null;
  qqq200: Qqq200Support | null;
  narrativeFacts: WeatherNarrativeFacts;
}

/**
 * Pure cycle → Market V2 adapter. It consumes only Worker observables and the
 * approved scoringV2 formulas; it performs no fetching and supplies no defaults.
 */
export function buildMarketV2Reading(
  context: MarketContext | null | undefined,
  weather: WeatherBenchmarksPayload | null | undefined,
): MarketV2Reading {
  const spy = weather?.benchmarks.SPY;
  const qqq = weather?.benchmarks.QQQ;
  const structure = computeStructure({
    price: spy?.price,
    atrPct: spy?.atrPct,
    ema10: spy?.ema10,
    ema20: spy?.ema20,
    sma20: spy?.sma20,
    sma50: spy?.sma50,
    sma200: spy?.sma200,
  });
  const participation = computeMarketParticipation({
    rspMinusSpy5dPct: weather?.rspMinusSpy5dPct,
    iwmMinusSpy5dPct: weather?.iwmMinusSpy5dPct,
    sectorSpdrOutperforming: weather?.sectorSpdrOutperforming,
    sectorSpdrOutperformingFreshCount:
      weather?.sectorSpdrOutperformingFreshCount,
    sectorSpdrAboveSma50: weather?.sectorSpdrAboveSma50,
    sectorSpdrAboveSma50FreshCount:
      weather?.sectorSpdrAboveSma50FreshCount,
  });
  const risk = computeMarketRisk({
    vix: context?.vix,
    hyOas: context?.highYieldSpreadPct,
  });
  const momentum = computeMomentum({
    rsi14: spy?.rsi14,
    change5dPct: spy?.return5dPct,
  });
  const pillars: WeatherV2Pillars = {
    ...(structure ? { structure: structure.value } : {}),
    ...(participation ? { participation: participation.value } : {}),
    ...(risk ? { risk: risk.value } : {}),
    ...(momentum ? { momentum: momentum.value } : {}),
  };
  const coverage = computeCoverage({
    layer: "market",
    hasInstrument: weather?.status !== "insufficient" && Boolean(spy),
    hasMinimumStructure: structure?.hasMinimumRelation === true,
    marketHasRisk: risk != null,
    marketHasFreshParticipation: participation != null,
    softBudgetPartial: weather?.status === "provisional",
    optionalInputMissing:
      weather?.status !== "complete" ||
      structure?.partial === true ||
      participation?.partial === true ||
      risk?.partial === true ||
      momentum?.partial === true,
    allPreferredInputsFresh: weather?.status === "complete",
  });
  const index = computeWeatherIndex("market", pillars);
  const qqqDistance = atrUnitDistance(
    qqq?.price,
    qqq?.ema200,
    qqq?.atrPct,
  );
  const qqq200 =
    qqqDistance == null ? null : computeQqq200Support(qqqDistance);
  const condition =
    coverage === "insufficient" || !index
      ? ({ kind: "insufficient", coverage: "insufficient" } as const)
      : classifyWeatherV2({
          layer: "market",
          coverage,
          pillars,
          weatherIndex: index.value,
          substantiallyBelowStructureRelation:
            structure?.relations.some((relation) => relation.substantiallyBelow),
          dailyRangeMultiple: spy?.dailyRangeMultiple,
          absoluteReturnAtrMultiple: spy?.absoluteReturnAtrMultiple,
          volumeRatio: spy?.volumeRatio,
          breakingResistance: spy?.breakingResistance,
          lostSupport: spy?.lostSupport,
          ...(qqq200 ? { qqq200 } : {}),
        });
  return {
    coverage,
    condition,
    pillars,
    pillarDetails: { structure, participation, risk, momentum },
    weatherIndex: index?.value ?? null,
    weatherIndexScore: index?.score ?? null,
    qqq200,
    narrativeFacts: {
      price: spy?.price,
      ema10: spy?.ema10,
      ema20: spy?.ema20,
      sma50: spy?.sma50,
      sma200: spy?.sma200,
      rsi14: spy?.rsi14,
      return5dPct: spy?.return5dPct,
      volumeRatio: spy?.volumeRatio,
      dailyRangeMultiple: spy?.dailyRangeMultiple,
      absoluteReturnAtrMultiple: spy?.absoluteReturnAtrMultiple,
      breakingResistance: spy?.breakingResistance,
      lostSupport: spy?.lostSupport,
      vix: context?.vix ?? undefined,
      rspMinusSpy5dPct: weather?.rspMinusSpy5dPct,
      iwmMinusSpy5dPct: weather?.iwmMinusSpy5dPct,
      sectorSpdrOutperforming: weather?.sectorSpdrOutperforming,
      sectorSpdrOutperformingFreshCount:
        weather?.sectorSpdrOutperformingFreshCount,
      sectorSpdrAboveSma50: weather?.sectorSpdrAboveSma50,
      sectorSpdrAboveSma50FreshCount:
        weather?.sectorSpdrAboveSma50FreshCount,
      qqqPrice: qqq?.price,
      qqqEma200: qqq?.ema200,
      qqq200Headwind: qqq200?.headwind,
      qqq200Break: qqq200?.break,
    },
  };
}
