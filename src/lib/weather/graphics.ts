import riskOnTideArt from "../../assets/market-weather-bg-risk-on-tide.webp";
import riskOffStormArt from "../../assets/market-weather-bg-risk-off-storm.webp";
import chopSeasArt from "../../assets/market-weather-bg-chop-seas.webp";
import breakoutWindArt from "../../assets/market-weather-bg-breakout-wind.webp";
import headwindArt from "../../assets/market-weather-bg-headwind.webp";
import tailwindArt from "../../assets/market-weather-bg-tailwind.webp";
import rotationCurrentArt from "../../assets/market-weather-bg-rotation-current.webp";
import calmWatersArt from "../../assets/market-weather-bg-calm-waters.webp";
import rogueWaveArt from "../../assets/market-weather-bg-rogue-wave.webp";
import redSkyWarningArt from "../../assets/market-weather-bg-red-sky-warning.webp";
import { WEATHER_CONDITIONS } from "./conditions";
import type { WeatherConditionId } from "./types";

// ---------------------------------------------------------------------------
// Dynamic graphic resolution.
//
// Each condition has a dynamicGraphicKey. The UI resolves it to a background
// treatment. Custom artwork (image/video) can be dropped into WEATHER_ART later
// WITHOUT touching component logic — until then we fall back to a CSS gradient
// built from the condition's design-system colors (see `.weather-bg--<id>` in
// index.css). The component layers an overlay for text legibility, a condition
// accent glow, a reduced-motion-safe treatment, and aria text.
// ---------------------------------------------------------------------------

// Condition artwork, keyed by condition id. All ten conditions ship art today;
// any id without an entry falls back to its CSS gradient automatically.
// Asset naming convention: `market-weather-bg-<conditionId>.webp` (in src/assets)
// so the file name states exactly which condition it renders. (WebP, full-res,
// q90 — visually lossless for this art at a fraction of PNG size.)
// >>> FUTURE ARTWORK <<< swap/add a condition graphic by dropping
// `market-weather-bg-<id>.webp` into src/assets, importing it here, and adding the
// `id: art` entry below — no component changes needed.
const WEATHER_ART: Partial<Record<WeatherConditionId, string>> = {
  "risk-on-tide": riskOnTideArt,
  "risk-off-storm": riskOffStormArt,
  "chop-seas": chopSeasArt,
  "breakout-wind": breakoutWindArt,
  headwind: headwindArt,
  tailwind: tailwindArt,
  "rotation-current": rotationCurrentArt,
  "calm-waters": calmWatersArt,
  "rogue-wave": rogueWaveArt,
  "red-sky-warning": redSkyWarningArt,
};

export interface WeatherGraphic {
  kind: "image" | "gradient";
  /** Present only when custom artwork exists. */
  src?: string;
  /** CSS gradient/texture fallback class (always set). */
  backgroundClass: string;
  /** Condition accent/glow/border class. */
  accentClass: string;
  /** Screen-reader description of the weather mood. */
  ariaLabel: string;
}

export function resolveWeatherGraphic(id: WeatherConditionId): WeatherGraphic {
  const condition = WEATHER_CONDITIONS[id];
  const src = WEATHER_ART[id];
  return {
    kind: src ? "image" : "gradient",
    src,
    backgroundClass: `weather-bg--${id}`,
    accentClass: `weather--${id}`,
    ariaLabel: `${condition.label}: ${condition.plainEnglishMeaning}`,
  };
}
