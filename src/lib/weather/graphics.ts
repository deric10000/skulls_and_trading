import riskOnTideArt from "../../assets/market-flow-market.png";
import rotationCurrentArt from "../../assets/market-flow-industry.png";
import breakoutWindArt from "../../assets/market-flow-sector.png";
import calmWatersArt from "../../assets/market-flow-stock.png";
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

// Condition artwork. The original four home-page graphics map to these four
// conditions; the remaining six fall back to a CSS gradient until art is added.
// >>> FUTURE ARTWORK <<< drop new imports here keyed by condition id (no
// component changes needed).
const WEATHER_ART: Partial<Record<WeatherConditionId, string>> = {
  "risk-on-tide": riskOnTideArt,
  "breakout-wind": breakoutWindArt,
  "rotation-current": rotationCurrentArt,
  "calm-waters": calmWatersArt,
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
