import type { Icon } from "../icons";

// ---------------------------------------------------------------------------
// Market Weather — type model.
//
// Product promise: "We don't predict the future. We read the conditions."
// The weather engine reads five instruments (trend, breadth, volatility, risk
// appetite, rotation) at four layers (market → sector → industry → stock) and
// turns them into a plain-English weather condition. It is NOT financial advice
// and never produces buy/sell calls.
//
// Everything here is provider-agnostic so the mock can later be swapped for real
// data feeds (see `mock.ts` and the `DataSource` seam) with no UI changes.
// ---------------------------------------------------------------------------

/** Trading session the weather is being read for. */
export type MarketWeatherTimeframe = "premarket" | "live" | "afterhours";

/** Macro → micro layers. */
export type MarketWeatherLayer = "market" | "sector" | "industry" | "stock";

/** The 10 shared weather conditions. */
export type WeatherConditionId =
  | "risk-on-tide"
  | "risk-off-storm"
  | "chop-seas"
  | "breakout-wind"
  | "headwind"
  | "tailwind"
  | "rotation-current"
  | "calm-waters"
  | "rogue-wave"
  | "red-sky-warning";

/** How a condition reads emotionally / how strongly to flag it. */
export type WeatherSeverity =
  | "positive"
  | "mild-positive"
  | "neutral"
  | "caution"
  | "negative"
  | "warning"
  | "alert";

/**
 * The five normalized instruments (each 0–100). For volatility, HIGHER = calmer
 * / more supportive (fear fading) so all instruments point the same direction:
 * higher is healthier.
 */
export interface WeatherSubScores {
  trend: number;
  breadth: number;
  volatility: number;
  riskAppetite: number;
  rotation: number;
}

/**
 * Detailed trend inputs (each 0–100 unless noted). Feeds `computeTrendScore`.
 * The 10/20/50-day MAs drive today's weather; the 200-day is climate context.
 */
export interface TrendInputs {
  priceVsSessionAnchor: number; // price vs VWAP / session anchor
  priceVs10DayMA: number;
  priceVs20DayMA: number;
  priceVs50DayMA: number;
  ma10Over20: number; // alignment component
  ma20Over50: number; // alignment component
  priceVs200DayMA: number; // 0–100 (above/below) — climate only
  distanceFrom200DayMA: number; // signed % distance from the 200-day
}

/**
 * 200-day "climate" modifier — long-term context, NOT today's weather label.
 * Applies only a small confidence nudge and a human-readable note.
 */
export interface ClimateContext {
  position: "above" | "below" | "near";
  note: string;
  confidenceAdjustment: number; // small +/- (points) applied to confidence
}

/** A single resolved reading for one layer. */
export interface WeatherLayerReading {
  layer: MarketWeatherLayer;
  /** Display name: "Market", a sector ("Technology"), industry, or ticker. */
  label: string;
  score: number; // 0–100 weather score
  confidence: number; // 0–100
  conditionId: WeatherConditionId;
  subScores: WeatherSubScores;
  explanation: string; // short, beginner-friendly
  why: string; // the "why" line
  climateContext: ClimateContext;
  dynamicGraphicKey: WeatherConditionId;
  lastUpdated: string; // ISO timestamp
}

/** Static definition for a weather condition (the shared condition library). */
export interface WeatherConditionDefinition {
  id: WeatherConditionId;
  label: string;
  shortLabel: string;
  plainEnglishMeaning: string;
  scoringRule: string;
  visualTone: string;
  /** Design-system color token names (see index.css ramps). */
  designSystemColors: string[];
  severity: WeatherSeverity;
  /** Icon from the curated icon set. */
  defaultIcon: Icon;
  dynamicGraphicKey: WeatherConditionId;
  recommendedUserMessage: string;
}

/**
 * The app-wide snapshot for one session. This is the unit a real API would fetch
 * ONCE per session and cache for all users: every sector, every industry, every
 * tracked stock — then filtered per user's portfolio/watchlist on the client.
 */
export interface MarketWeatherSnapshot {
  timeframe: MarketWeatherTimeframe;
  generatedAt: string;
  market: WeatherLayerReading;
  sectors: Record<string, WeatherLayerReading>; // keyed by sector name
  industries: Record<string, WeatherLayerReading>; // keyed by industry name
  stocks: Record<string, WeatherLayerReading>; // keyed by ticker
  /**
   * Universe taxonomy: which sector each industry rolls up to (industry name →
   * sector name). Lets the client cascade Sector → Industry → Stock without
   * inferring the hierarchy from the (watch-only) ticker list.
   */
  industrySectors: Record<string, string>;
}
