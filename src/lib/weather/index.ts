import type { SignalTone } from "../../types";
import type { WeatherSeverity } from "./types";

export * from "./types";
export * from "./conditions";
export * from "./scoring";
export * from "./session";
export * from "./graphics";
export * from "./taxonomy";
export { buildLiveWeatherSnapshot, subScoresFromMarketContext } from "./live";
/** Mock-only — FreeTier uses `weather/live` via dataSource.getMarketWeather. */
export { getMarketWeatherSnapshot } from "./mock";

// Map a condition's severity to a design-system signal tone (chip coloring).
export const SEVERITY_TONE: Record<WeatherSeverity, SignalTone> = {
  positive: "positive",
  "mild-positive": "positive",
  neutral: "neutral",
  caution: "warning",
  negative: "negative",
  warning: "warning",
  alert: "warning",
};

// Confidence is colored by RANGE, independent of the condition's tone (per the
// Figma chip set): high reads positive, medium reads warning, low reads
// negative. Thresholds anchor to the design examples — 90% high, 60% medium,
// 39% low — and sit just under the session confidence caps (premarket 70).
export const CONFIDENCE_HIGH_MIN = 70;
export const CONFIDENCE_MEDIUM_MIN = 40;

export function confidenceTone(value: number): SignalTone {
  if (value >= CONFIDENCE_HIGH_MIN) return "positive";
  if (value >= CONFIDENCE_MEDIUM_MIN) return "warning";
  return "negative";
}
