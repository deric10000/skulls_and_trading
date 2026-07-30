/**
 * Pure live-cache inputs → Stock V2 adapter. It consumes no close arrays and
 * never tilts from a parent; Sector Weather Index is backdrop context only.
 */
import type {
  TechnicalSnapshot,
  TimeframedIndicators,
} from "../../types";
import type { WeatherSymbolObservable } from "../market/client";
import {
  classifyWeatherV2,
  computeCoverage,
  computeInstrumentRisk,
  computeMomentum,
  computeRelativeStrength,
  computeStructure,
  computeVolumeParticipation,
  computeWeatherIndex,
} from "./scoringV2";
import type {
  WeatherV2Classification,
  WeatherV2Coverage,
  WeatherV2PillarScore,
  WeatherV2Pillars,
} from "./scoringV2Types";

export interface StockV2AdapterInputs {
  ticker: string;
  price?: number | null;
  technicals?: TechnicalSnapshot | null;
  dailyIndicators?: TimeframedIndicators | null;
  observable?: WeatherSymbolObservable | null;
  /** Mapped Sector Weather Index; backdrop only, never an index weight. */
  sectorWeatherIndex?: number;
  /** Optional completed-bar event evidence; absent terms can never fire. */
  events?: {
    dailyRangeMultiple?: number;
    absoluteReturnAtrMultiple?: number;
    breakingResistance?: boolean;
    lostSupport?: boolean;
  };
}

export interface StockV2Reading {
  ticker: string;
  coverage: WeatherV2Coverage;
  condition: WeatherV2Classification;
  pillars: WeatherV2Pillars;
  pillarDetails: {
    structure: ReturnType<typeof computeStructure>;
    relativeStrength: WeatherV2PillarScore | null;
    risk: WeatherV2PillarScore | null;
    momentum: WeatherV2PillarScore | null;
    participation: WeatherV2PillarScore | null;
  };
  weatherIndex: number | null;
  weatherIndexScore: number | null;
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function levelFromPriceDistance(
  price: number | null | undefined,
  priceVsLevelPct: number | null | undefined,
): number | undefined {
  if (!finite(price) || price <= 0 || !finite(priceVsLevelPct)) return undefined;
  const denominator = 1 + priceVsLevelPct / 100;
  return denominator > 0 ? price / denominator : undefined;
}

export function buildStockV2Reading(
  inputs: StockV2AdapterInputs,
): StockV2Reading {
  const price = inputs.price ?? inputs.observable?.price;
  const daily = inputs.dailyIndicators;
  const technicals = inputs.technicals;
  const ema10 = inputs.observable?.ema10 ?? levelFromPriceDistance(
    price,
    daily?.priceVsEma10Pct ?? technicals?.priceVs10EmaPct,
  );
  const ema20 = inputs.observable?.ema20 ?? levelFromPriceDistance(
    price,
    daily?.priceVsEma20Pct ?? technicals?.priceVs20EmaPct,
  );
  const structure = computeStructure({
    price,
    atrPct:
      inputs.observable?.atrPct ?? daily?.atrPct ?? technicals?.atrPct14d,
    ema10,
    ema20,
    sma20: inputs.observable?.sma20,
    sma50: inputs.observable?.sma50,
    sma200: inputs.observable?.sma200,
  });
  const relativeStrength = computeRelativeStrength({
    layer: "stock",
    rsVsSpy5d: inputs.observable?.rsVsSpy5d,
    rsVsSpy20d: inputs.observable?.rsVsSpy20d,
    rsVsSector5d: inputs.observable?.rsVsSector5d,
    rsVsSector20d: inputs.observable?.rsVsSector20d,
  });
  const risk = computeInstrumentRisk({
    atrPct14d:
      inputs.observable?.atrPct ?? daily?.atrPct ?? technicals?.atrPct14d,
    atrPctBaseline60d: inputs.observable?.atrPctBaseline60d,
    drawdownFrom20dHighPct: inputs.observable?.drawdownFrom20dHighPct,
  });
  const momentum = computeMomentum({
    rsi14: inputs.observable?.rsi14 ?? daily?.rsi ?? technicals?.rsi14,
    change5dPct: inputs.observable?.return5dPct,
  });
  const relativeVolume =
    daily?.relativeVolume ?? technicals?.relativeVolume;
  const participation = computeVolumeParticipation({ relativeVolume });
  const pillars: WeatherV2Pillars = {
    ...(structure ? { structure: structure.value } : {}),
    ...(relativeStrength
      ? { relativeStrength: relativeStrength.value }
      : {}),
    ...(risk ? { risk: risk.value } : {}),
    ...(momentum ? { momentum: momentum.value } : {}),
    ...(participation ? { participation: participation.value } : {}),
  };
  const coverage = computeCoverage({
    layer: "stock",
    hasInstrument: finite(price) && price > 0,
    hasMinimumStructure: structure?.hasMinimumRelation === true,
    optionalInputMissing:
      structure?.partial === true ||
      relativeStrength?.partial === true ||
      risk?.partial === true ||
      momentum?.partial === true ||
      participation == null,
    allPreferredInputsFresh:
      structure?.partial !== true &&
      relativeStrength?.partial !== true &&
      risk?.partial !== true &&
      momentum?.partial !== true &&
      participation != null,
  });
  const index = computeWeatherIndex("stock", pillars);
  const condition =
    coverage === "insufficient" || !index
      ? ({ kind: "insufficient", coverage: "insufficient" } as const)
      : classifyWeatherV2({
          layer: "stock",
          coverage,
          pillars,
          weatherIndex: index.value,
          higherLayerIndex: inputs.sectorWeatherIndex,
          substantiallyBelowStructureRelation: structure?.relations.some(
            (relation) => relation.substantiallyBelow,
          ),
          dailyRangeMultiple: inputs.events?.dailyRangeMultiple,
          absoluteReturnAtrMultiple: inputs.events?.absoluteReturnAtrMultiple,
          breakingResistance: inputs.events?.breakingResistance,
          lostSupport: inputs.events?.lostSupport,
          ...(finite(relativeVolume) ? { volumeRatio: relativeVolume } : {}),
        });
  return {
    ticker: inputs.ticker.toUpperCase(),
    coverage,
    condition,
    pillars,
    pillarDetails: {
      structure,
      relativeStrength,
      risk,
      momentum,
      participation,
    },
    weatherIndex: index?.value ?? null,
    weatherIndexScore: index?.score ?? null,
  };
}
