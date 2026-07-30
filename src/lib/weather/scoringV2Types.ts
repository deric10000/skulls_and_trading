import type { MarketWeatherLayer } from "./types";

export type WeatherV2Layer = MarketWeatherLayer;
export type WeatherV2Coverage =
  | "insufficient"
  | "provisional"
  | "partial"
  | "complete";

export type WeatherV2ConditionId =
  | "risk-on-tide"
  | "risk-off-storm"
  | "chop-seas"
  | "breakout-wind"
  | "headwind"
  | "tailwind"
  | "rotation-current"
  | "calm-waters"
  | "rogue-wave"
  | "red-sky-warning"
  | "mixed-signals";

export interface WeatherV2PillarScore {
  /** Full-precision value used by classification. */
  value: number;
  /** Half-up integer persisted/displayed after pillar aggregation. */
  score: number;
  componentCount: number;
  partial: boolean;
}

export type StructureRelationName =
  | "short"
  | "sma50"
  | "sma200"
  | "ema10OverEma20";

export interface StructureRelationScore {
  relation: StructureRelationName;
  distanceAtr?: number;
  score: number;
  substantiallyBelow: boolean;
}

export interface StructureScore extends WeatherV2PillarScore {
  relations: StructureRelationScore[];
  hasMinimumRelation: boolean;
}

export interface StructureInputs {
  price?: number | null;
  atrPct?: number | null;
  ema20?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  ema10?: number | null;
}

export interface MarketParticipationInputs {
  rspMinusSpy5dPct?: number | null;
  iwmMinusSpy5dPct?: number | null;
  sectorSpdrOutperforming?: number | null;
  sectorSpdrOutperformingFreshCount?: number;
  sectorSpdrAboveSma50?: number | null;
  sectorSpdrAboveSma50FreshCount?: number;
}

export interface MarketRiskInputs {
  vix?: number | null;
  priorCompletedVix?: number | null;
  hyOas?: number | null;
}

export interface MomentumInputs {
  rsi14?: number | null;
  change5dPct?: number | null;
}

export interface VolumeParticipationInputs {
  relativeVolume?: number | null;
}

export interface RelativeStrengthInputs {
  layer: "sector" | "industry" | "stock";
  rsVsSpy5d?: number | null;
  rsVsSpy20d?: number | null;
  rsVsSector5d?: number | null;
  rsVsSector20d?: number | null;
}

export interface InstrumentRiskInputs {
  atrPct14d?: number | null;
  atrPctBaseline60d?: number | null;
  drawdownFrom20dHighPct?: number | null;
}

export interface WeatherV2Pillars {
  structure?: number;
  participation?: number;
  risk?: number;
  momentum?: number;
  relativeStrength?: number;
}

export interface CoverageInputs {
  layer: WeatherV2Layer;
  hasInstrument: boolean;
  hasMinimumStructure: boolean;
  marketHasRisk?: boolean;
  marketHasFreshParticipation?: boolean;
  softBudgetPartial?: boolean;
  optionalInputMissing?: boolean;
  allPreferredInputsFresh?: boolean;
}

export interface Qqq200Support {
  distanceAtr: number;
  near: boolean;
  headwind: boolean;
  break: boolean;
  confidenceAdjustment: 0 | -2;
}

export interface ClassifyWeatherV2Inputs {
  layer: WeatherV2Layer;
  coverage: WeatherV2Coverage;
  pillars: WeatherV2Pillars;
  /** Full-precision computed Index; classification must not use its rounded projection. */
  weatherIndex: number;
  higherLayerIndex?: number;
  substantiallyBelowStructureRelation?: boolean;
  lostSupport?: boolean;
  qqq200?: Qqq200Support;

  dailyRangeMultiple?: number;
  absoluteReturnAtrMultiple?: number;
  volumeRatio?: number;
  breakingResistance?: boolean;
  /** Cycle deltas use stored half-up integers for deterministic replay. */
  weatherIndexDelta?: number;
  riskDelta?: number;
  confirmationDelta?: number;
  relativeStrengthImprovement?: number;
  hasPriorFreshV2Cycle?: boolean;
}

export type WeatherV2Classification =
  | {
      kind: "condition";
      coverage: Exclude<WeatherV2Coverage, "insufficient">;
      conditionId: WeatherV2ConditionId;
    }
  | { kind: "insufficient"; coverage: "insufficient" }
  | {
      kind: "industry-unavailable";
      coverage: "insufficient";
      reason: "independent-industry-weather-unavailable";
    };
