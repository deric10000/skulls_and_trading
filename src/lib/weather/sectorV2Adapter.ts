/**
 * Pure cycle → Sector V2 adapter. Maps GICS sector → SPDR benchmarks via the
 * SSOT map and scoringV2. Does not tilt from market; missing SPDR → insufficient.
 * FreeTier UI remains on v1 until a separate flip.
 */

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
  WeatherV2PillarScore,
  WeatherV2Pillars,
} from "./scoringV2Types";
import {
  assertGicsSectorSpdrMap,
  spdrForGicsSector,
} from "./sectorSpdr";
import { GICS_SECTORS, type GicsSector } from "./taxonomy";
import type { WeatherNarrativeFacts } from "./narrative";

export interface SectorV2Reading {
  sector: GicsSector | null;
  spdr: string | null;
  coverage: WeatherV2Coverage;
  condition: WeatherV2Classification;
  pillars: WeatherV2Pillars;
  pillarDetails: {
    structure: ReturnType<typeof computeStructure>;
    relativeStrength: WeatherV2PillarScore | null;
    risk: WeatherV2PillarScore | null;
    momentum: WeatherV2PillarScore | null;
  };
  weatherIndex: number | null;
  weatherIndexScore: number | null;
  narrativeFacts: WeatherNarrativeFacts;
}

function emptySectorReading(
  sector: GicsSector | null,
  spdr: string | null,
): SectorV2Reading {
  return {
    sector,
    spdr,
    coverage: "insufficient",
    condition: { kind: "insufficient", coverage: "insufficient" },
    pillars: {},
    pillarDetails: {
      structure: null,
      relativeStrength: null,
      risk: null,
      momentum: null,
    },
    weatherIndex: null,
    weatherIndexScore: null,
    narrativeFacts: {},
  };
}

/**
 * Build one Sector V2 reading from published weather benchmarks.
 * @param higherLayerIndex Market Weather Index (backdrop only; optional).
 * @param relativeStrengthImprovement Prior-cycle RS20 improvement for Rotation.
 */
export function buildSectorV2Reading(
  sector: string,
  weather: WeatherBenchmarksPayload | null | undefined,
  options: {
    higherLayerIndex?: number;
    relativeStrengthImprovement?: number;
    hasPriorFreshV2Cycle?: boolean;
  } = {},
): SectorV2Reading {
  assertGicsSectorSpdrMap();
  const spdr = spdrForGicsSector(sector);
  if (!spdr || !GICS_SECTORS.includes(sector as GicsSector)) {
    return emptySectorReading(null, null);
  }
  const typedSector = sector as GicsSector;
  const obs = weather?.benchmarks[spdr];
  if (!obs) return emptySectorReading(typedSector, spdr);
  const freshness =
    weather?.freshnessBySymbol?.[spdr] ??
    obs.freshness ??
    "fresh";

  const structure = computeStructure({
    price: obs.price,
    atrPct: obs.atrPct,
    ema10: obs.ema10,
    ema20: obs.ema20,
    sma20: obs.sma20,
    sma50: obs.sma50,
    sma200: obs.sma200,
  });
  const rsVsSpy5d =
    obs.rsVsSpy5d ??
    (typeof obs.return5dPct === "number" &&
    typeof weather?.benchmarks.SPY?.return5dPct === "number"
      ? obs.return5dPct - weather.benchmarks.SPY.return5dPct
      : undefined);
  const rsVsSpy20d =
    obs.rsVsSpy20d ??
    (typeof obs.return20dPct === "number" &&
    typeof weather?.benchmarks.SPY?.return20dPct === "number"
      ? obs.return20dPct - weather.benchmarks.SPY.return20dPct
      : undefined);
  const relativeStrength = computeRelativeStrength({
    layer: "sector",
    rsVsSpy5d,
    rsVsSpy20d,
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
  const coverage = computeCoverage({
    layer: "sector",
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
  const index = computeWeatherIndex("sector", pillars);
  const condition =
    coverage === "insufficient" || !index
      ? ({ kind: "insufficient", coverage: "insufficient" } as const)
      : classifyWeatherV2({
          layer: "sector",
          coverage,
          pillars,
          weatherIndex: index.value,
          higherLayerIndex: options.higherLayerIndex,
          substantiallyBelowStructureRelation: structure?.relations.some(
            (relation) => relation.substantiallyBelow,
          ),
          dailyRangeMultiple: obs.dailyRangeMultiple,
          absoluteReturnAtrMultiple: obs.absoluteReturnAtrMultiple,
          volumeRatio: obs.volumeRatio,
          breakingResistance: obs.breakingResistance,
          lostSupport: obs.lostSupport,
          relativeStrengthImprovement: options.relativeStrengthImprovement,
          ...(options.relativeStrengthImprovement == null &&
          typeof obs.priorFreshRsVsSpy20d === "number" &&
          typeof rsVsSpy20d === "number"
            ? {
                relativeStrengthImprovement:
                  rsVsSpy20d - obs.priorFreshRsVsSpy20d,
              }
            : {}),
          hasPriorFreshV2Cycle:
            options.hasPriorFreshV2Cycle ??
            typeof obs.priorFreshRsVsSpy20d === "number",
        });
  return {
    sector: typedSector,
    spdr,
    coverage,
    condition,
    pillars,
    pillarDetails: { structure, relativeStrength, risk, momentum },
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
      rsVsSpy5d,
      rsVsSpy20d,
      relativeStrengthImprovement:
        options.relativeStrengthImprovement ??
        (typeof obs.priorFreshRsVsSpy20d === "number" &&
        typeof rsVsSpy20d === "number"
          ? rsVsSpy20d - obs.priorFreshRsVsSpy20d
          : undefined),
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

export function buildAllSectorV2Readings(
  weather: WeatherBenchmarksPayload | null | undefined,
  options: {
    higherLayerIndex?: number;
  } = {},
): SectorV2Reading[] {
  return GICS_SECTORS.map((sector) =>
    buildSectorV2Reading(sector, weather, options),
  );
}
