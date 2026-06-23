import { WEATHER_CONDITIONS } from "./conditions";
import type {
  ClimateContext,
  MarketWeatherLayer,
  MarketWeatherTimeframe,
  TrendInputs,
  WeatherConditionId,
  WeatherLayerReading,
  WeatherSubScores,
} from "./types";

// ---------------------------------------------------------------------------
// Scoring engine. Pure functions only (no I/O), so the same logic runs on mock
// data today and on real provider data later. All inputs/outputs are normalized
// 0–100 where HIGHER = healthier (including volatility, where higher = calmer).
// ---------------------------------------------------------------------------

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

/** Weather score band per the product spec. */
export type ScoreBand = "damaged" | "weak" | "mixed" | "healthy" | "strong";

export function scoreBand(score: number): ScoreBand {
  if (score <= 30) return "damaged";
  if (score <= 45) return "weak";
  if (score <= 54) return "mixed";
  if (score <= 69) return "healthy";
  return "strong";
}

// --- Trend sub-score -------------------------------------------------------
// 10/20/50-day MAs drive today's weather. The 200-day is climate only (handled
// separately in computeClimateContext) and never enters this score.
const TREND_WEIGHTS = {
  anchor: 0.3, // price vs VWAP / session anchor
  ma10: 0.25,
  ma20: 0.2,
  ma50: 0.15,
  alignment: 0.1, // 10/20/50 stacking
} as const;

export function computeTrendScore(inputs: TrendInputs): number {
  const alignment = (inputs.ma10Over20 + inputs.ma20Over50) / 2;
  const score =
    inputs.priceVsSessionAnchor * TREND_WEIGHTS.anchor +
    inputs.priceVs10DayMA * TREND_WEIGHTS.ma10 +
    inputs.priceVs20DayMA * TREND_WEIGHTS.ma20 +
    inputs.priceVs50DayMA * TREND_WEIGHTS.ma50 +
    alignment * TREND_WEIGHTS.alignment;
  return clamp(Math.round(score));
}

// --- Weather score ---------------------------------------------------------
const WEATHER_WEIGHTS = {
  trend: 0.3,
  breadth: 0.25,
  volatility: 0.2,
  riskAppetite: 0.15,
  rotation: 0.1,
} as const;

export function computeWeatherScore(sub: WeatherSubScores): number {
  const score =
    sub.trend * WEATHER_WEIGHTS.trend +
    sub.breadth * WEATHER_WEIGHTS.breadth +
    sub.volatility * WEATHER_WEIGHTS.volatility +
    sub.riskAppetite * WEATHER_WEIGHTS.riskAppetite +
    sub.rotation * WEATHER_WEIGHTS.rotation;
  return clamp(Math.round(score));
}

// --- 200-day climate context (NOT today's weather) -------------------------
export function computeClimateContext(
  priceVs200DayMA: number,
  distanceFrom200DayMA: number,
): ClimateContext {
  const near = Math.abs(distanceFrom200DayMA) <= 2;
  if (near) {
    return {
      position: "near",
      note: "Price is sitting right at its 200-day line — a major long-term support/resistance zone.",
      confidenceAdjustment: -4,
    };
  }
  if (priceVs200DayMA >= 50) {
    return {
      position: "above",
      note: "Above the 200-day: the long-term climate is still constructive.",
      confidenceAdjustment: 3,
    };
  }
  return {
    position: "below",
    note: "Below the 200-day: long-term overhead climate risk remains.",
    confidenceAdjustment: -3,
  };
}

// --- Condition classification ----------------------------------------------
// Optional real-world signals beyond the five instruments. A real provider can
// populate these; the mock supplies what it can and the rest default to safe
// values so classification still works.
export interface ClassifyContext {
  /** Daily volume as a fraction of normal (1.0 = normal, 1.2 = 120%). */
  volumeRatio?: number;
  /** Absolute move as a multiple of the normal daily range. */
  dailyRangeMultiple?: number;
  /** A material catalyst/news event is detected. */
  catalyst?: boolean;
  /** Options/volume activity is unusually elevated. */
  unusualActivity?: boolean;
  /** Change in weather score vs. the prior reading (today's delta). */
  scoreDeltaToday?: number;
  /** Price is breaking above recent resistance / prior high / key MA. */
  breakingResistance?: boolean;
  /** Relative strength of this group (sector/industry layers), 0–100. */
  relativeStrength?: number;
  /** Relative strength has improved over the last 3–10 sessions. */
  rsImproving?: boolean;
  /** Score of the layer above this one (market > sector > industry > stock). */
  higherLayerScore?: number;
  /** This layer just lost a support level. */
  lostSupport?: boolean;
}

/**
 * Classify a layer into one of the 10 conditions using the documented priority:
 * abnormal events and danger warnings override normal regime labels; Calm Waters
 * is the last resort. Returns the first matching condition.
 */
export function classifyCondition(
  sub: WeatherSubScores,
  weatherScore: number,
  ctx: ClassifyContext = {},
): WeatherConditionId {
  const {
    volumeRatio = 1,
    dailyRangeMultiple = 1,
    catalyst = false,
    unusualActivity = false,
    scoreDeltaToday = 0,
    breakingResistance = false,
    relativeStrength = 0,
    rsImproving = false,
    higherLayerScore,
    lostSupport = false,
  } = ctx;

  // 1. Rogue Wave — abnormal move.
  if (
    dailyRangeMultiple > 1.5 ||
    volumeRatio > 2 ||
    catalyst ||
    unusualActivity
  ) {
    return "rogue-wave";
  }

  // 2. Red Sky Warning — risk rising before the breakdown is obvious.
  const deterioratingFast =
    scoreDeltaToday <= -12 && sub.volatility < 50 && sub.breadth < 50;
  const marketRiskRising = higherLayerScore !== undefined && higherLayerScore < 45;
  if (deterioratingFast || (lostSupport && marketRiskRising)) {
    return "red-sky-warning";
  }

  // 3. Breakout Wind — momentum through resistance with participation.
  if (
    sub.trend >= 70 &&
    sub.breadth >= 60 &&
    volumeRatio >= 1.2 &&
    breakingResistance
  ) {
    return "breakout-wind";
  }

  // 4. Rotation Current — money flowing into the group.
  if (relativeStrength >= 70 && rsImproving && sub.breadth >= 55) {
    return "rotation-current";
  }

  // 5. Risk-Off Storm — broad selling pressure.
  if (
    weatherScore <= 35 &&
    sub.trend <= 40 &&
    sub.breadth <= 40 &&
    sub.volatility <= 40
  ) {
    return "risk-off-storm";
  }

  // 6. Risk-On Tide — broadly supportive.
  if (
    weatherScore >= 65 &&
    sub.trend >= 60 &&
    sub.breadth >= 55 &&
    sub.volatility >= 45 &&
    sub.riskAppetite >= 55
  ) {
    return "risk-on-tide";
  }

  // 7. Headwind — fighting a weaker environment.
  const higherLayerOk = higherLayerScore !== undefined && higherLayerScore >= 46;
  if (weatherScore < 45 && (higherLayerOk || (sub.trend >= 50 && sub.breadth < 45))) {
    return "headwind";
  }

  // 8. Tailwind — supportive but not explosive.
  if (
    weatherScore >= 55 &&
    weatherScore <= 64 &&
    sub.trend >= 52 &&
    sub.volatility >= 48 &&
    sub.breadth >= 48
  ) {
    return "tailwind";
  }

  // 9. Chop Seas — mixed / signals disagree.
  const signalSpread = maxSub(sub) - minSub(sub);
  if ((weatherScore >= 45 && weatherScore <= 55) || signalSpread >= 35) {
    return "chop-seas";
  }

  // 10. Calm Waters — nothing more specific applies.
  return "calm-waters";
}

// --- Confidence ------------------------------------------------------------
const TIMEFRAME_CONFIDENCE_CAP: Record<MarketWeatherTimeframe, number> = {
  premarket: 70,
  live: 90,
  afterhours: 75,
};

export interface ConfidenceContext extends ClassifyContext {
  /** Price sits near the 200/50-day or major support/resistance. */
  nearMajorLevel?: boolean;
  /** A major news / Fed / economic event is pending. */
  pendingEvent?: boolean;
}

/**
 * Confidence reflects how much the signals AGREE — not how bullish they are.
 * Tight agreement + volume confirmation = high confidence; disagreement, thin
 * session liquidity, messy transition zones, or pending events lower it. Capped
 * per session because pre/after-hours liquidity is less reliable.
 */
export function computeConfidence(
  sub: WeatherSubScores,
  timeframe: MarketWeatherTimeframe,
  climate: ClimateContext,
  ctx: ConfidenceContext = {},
): number {
  const values = subValues(sub);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const avgDeviation =
    values.reduce((a, b) => a + Math.abs(b - mean), 0) / values.length;

  // Tight agreement (low deviation) → high base confidence.
  let confidence = clamp(100 - avgDeviation * 2.2);

  if ((ctx.volumeRatio ?? 1) >= 1.2) confidence += 5; // volume confirms
  if (ctx.nearMajorLevel) confidence -= 6; // messy decision zone
  if (ctx.pendingEvent) confidence -= 8; // event risk
  if (sub.breadth < 50 && sub.trend > 60) confidence -= 6; // green index, weak breadth

  confidence += climate.confidenceAdjustment;

  return Math.round(clamp(confidence, 0, TIMEFRAME_CONFIDENCE_CAP[timeframe]));
}

// --- Explanation / "why" ---------------------------------------------------
const HIGH_PHRASE: Record<keyof WeatherSubScores, string> = {
  trend: "price is trending up",
  breadth: "broad participation",
  volatility: "volatility is fading",
  riskAppetite: "investors are leaning aggressive",
  rotation: "money is rotating in",
};

const LOW_PHRASE: Record<keyof WeatherSubScores, string> = {
  trend: "price is sliding",
  breadth: "few names are participating",
  volatility: "fear is rising",
  riskAppetite: "investors are hiding in safety",
  rotation: "money is rotating out",
};

/** Build a short, beginner-friendly "why" line from the strongest/weakest reads. */
export function buildWhy(sub: WeatherSubScores): string {
  const entries = (Object.keys(sub) as (keyof WeatherSubScores)[]).map((key) => ({
    key,
    value: sub[key],
  }));
  const strongest = entries.reduce((a, b) => (b.value > a.value ? b : a));
  const weakest = entries.reduce((a, b) => (b.value < a.value ? b : a));

  if (weakest.value >= 55) {
    return `${capitalize(HIGH_PHRASE[strongest.key])}, and ${HIGH_PHRASE[weakest.key]}.`;
  }
  if (strongest.value <= 45) {
    return `${capitalize(LOW_PHRASE[weakest.key])}, and ${LOW_PHRASE[strongest.key]}.`;
  }
  return `${capitalize(HIGH_PHRASE[strongest.key])}, but ${LOW_PHRASE[weakest.key]}.`;
}

// --- Reading assembly ------------------------------------------------------
export interface BuildReadingArgs {
  layer: MarketWeatherLayer;
  label: string;
  timeframe: MarketWeatherTimeframe;
  subScores: WeatherSubScores;
  /** If supplied, trend is computed from these and overrides subScores.trend. */
  trendInputs?: TrendInputs;
  priceVs200DayMA: number;
  distanceFrom200DayMA: number;
  classify?: ClassifyContext;
  confidence?: ConfidenceContext;
  explanation?: string; // optional override (else condition message)
  lastUpdated?: string;
}

/**
 * Orchestrates the engine for one layer: weather score → condition → confidence
 * → climate context → human-readable copy. This is what a UI consumes and what
 * the mock/API produces.
 */
export function buildReading(args: BuildReadingArgs): WeatherLayerReading {
  const subScores: WeatherSubScores = args.trendInputs
    ? { ...args.subScores, trend: computeTrendScore(args.trendInputs) }
    : args.subScores;

  const score = computeWeatherScore(subScores);
  const climateContext = computeClimateContext(
    args.priceVs200DayMA,
    args.distanceFrom200DayMA,
  );
  const conditionId = classifyCondition(subScores, score, args.classify);
  const confidence = computeConfidence(subScores, args.timeframe, climateContext, {
    ...args.classify,
    ...args.confidence,
  });

  return {
    layer: args.layer,
    label: args.label,
    score,
    confidence,
    conditionId,
    subScores,
    explanation: args.explanation ?? WEATHER_CONDITIONS[conditionId].recommendedUserMessage,
    why: buildWhy(subScores),
    climateContext,
    dynamicGraphicKey: conditionId,
    lastUpdated: args.lastUpdated ?? new Date().toISOString(),
  };
}

// --- helpers ---------------------------------------------------------------
function subValues(sub: WeatherSubScores): number[] {
  return [sub.trend, sub.breadth, sub.volatility, sub.riskAppetite, sub.rotation];
}
function maxSub(sub: WeatherSubScores): number {
  return Math.max(...subValues(sub));
}
function minSub(sub: WeatherSubScores): number {
  return Math.min(...subValues(sub));
}
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
