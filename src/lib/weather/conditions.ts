import {
  Anchor,
  CloudLightning,
  Hurricane,
  Sailboat,
  Siren,
  WarningOctagon,
  WaveTriangle,
  Waves,
  Wind,
  WindReversed,
} from "../icons";
import type { WeatherConditionDefinition, WeatherConditionId } from "./types";

// ---------------------------------------------------------------------------
// Centralized weather-condition library. Every surface (cards, pills, future
// graphics) reads condition metadata from here so labels, colors, icons, and
// copy stay consistent. Colors reference design-system ramps in index.css; the
// per-condition CSS lives under `.weather--<id>` classes.
// ---------------------------------------------------------------------------

export const WEATHER_CONDITIONS: Record<
  WeatherConditionId,
  WeatherConditionDefinition
> = {
  "risk-on-tide": {
    id: "risk-on-tide",
    label: "Risk-On Tide",
    shortLabel: "Risk-On",
    plainEnglishMeaning:
      "Broad conditions are supportive. Buyers are active, volatility is manageable, and aggressive stocks have wind behind them.",
    scoringRule:
      "Weather >= 65, Trend >= 60, Breadth >= 55, Volatility >= 45, Risk Appetite >= 55",
    visualTone: "Strong, bullish, energetic, forward-moving.",
    designSystemColors: ["--green-400", "--green-500", "--green-300"],
    severity: "positive",
    defaultIcon: Waves,
    dynamicGraphicKey: "risk-on-tide",
    recommendedUserMessage:
      "Conditions are supportive. Buyers are active and risk appetite is healthy.",
  },
  "risk-off-storm": {
    id: "risk-off-storm",
    label: "Risk-Off Storm",
    shortLabel: "Risk-Off",
    plainEnglishMeaning:
      "Broad selling pressure is active. Most stocks are fighting the tape.",
    scoringRule: "Weather <= 35, Trend <= 40, Breadth <= 40, Volatility <= 40",
    visualTone: "Dangerous, stormy, defensive.",
    designSystemColors: ["--red-500", "--red-600", "--ink-700"],
    severity: "negative",
    defaultIcon: CloudLightning,
    dynamicGraphicKey: "risk-off-storm",
    recommendedUserMessage:
      "Selling pressure is broad. Most names are fighting the market.",
  },
  "chop-seas": {
    id: "chop-seas",
    label: "Chop Seas",
    shortLabel: "Chop",
    plainEnglishMeaning:
      "The market is mixed, unstable, or directionless. Fakeouts are more likely.",
    scoringRule:
      "Weather 45–55, or major disagreement between signals (e.g. strong trend but weak breadth / rising volatility)",
    visualTone: "Unstable, messy, uncertain.",
    designSystemColors: ["--amber-400", "--blue-400", "--text-faint"],
    severity: "neutral",
    defaultIcon: WaveTriangle,
    dynamicGraphicKey: "chop-seas",
    recommendedUserMessage:
      "Conditions are mixed. Moves may fake out in both directions.",
  },
  "breakout-wind": {
    id: "breakout-wind",
    label: "Breakout Wind",
    shortLabel: "Breakout",
    plainEnglishMeaning:
      "Momentum is pushing through resistance with volume and participation.",
    scoringRule:
      "Trend >= 70, Breadth >= 60, Volume >= 120% of normal, price breaking above resistance / prior high / key MA",
    visualTone: "Powerful, directional, accelerating.",
    designSystemColors: ["--green-400", "--green-300", "--blue-300"],
    severity: "positive",
    defaultIcon: Wind,
    dynamicGraphicKey: "breakout-wind",
    recommendedUserMessage: "Buyers are pressing through resistance with momentum.",
  },
  headwind: {
    id: "headwind",
    label: "Headwind",
    shortLabel: "Headwind",
    plainEnglishMeaning:
      "The asset or layer is facing pressure from its surrounding environment.",
    scoringRule:
      "Layer score < 45 while a higher layer is neutral/positive, or stock rising into a weak sector/industry/market",
    visualTone: "Resistance, pressure, struggle.",
    designSystemColors: ["--brand-ember", "--amber-500", "--text-faint"],
    severity: "caution",
    defaultIcon: WindReversed,
    dynamicGraphicKey: "headwind",
    recommendedUserMessage:
      "This name may be fighting pressure from its sector, industry, or broader market.",
  },
  tailwind: {
    id: "tailwind",
    label: "Tailwind",
    shortLabel: "Tailwind",
    plainEnglishMeaning:
      "Conditions are supportive, but not explosive. The backdrop is helping.",
    scoringRule:
      "Layer score 55–64, trend positive, volatility not rising sharply, breadth acceptable but not breakout-level",
    visualTone: "Supportive, steady, constructive.",
    designSystemColors: ["--green-500", "--blue-400", "--green-300"],
    severity: "mild-positive",
    defaultIcon: Sailboat,
    dynamicGraphicKey: "tailwind",
    recommendedUserMessage:
      "The backdrop is supportive, but momentum is not yet explosive.",
  },
  "rotation-current": {
    id: "rotation-current",
    label: "Rotation Current",
    shortLabel: "Rotation",
    plainEnglishMeaning:
      "Money is moving into this sector, industry, or theme.",
    scoringRule:
      "Sector/industry relative strength >= 70, RS improving over 3–10 days, peer breadth >= 55, volume improving across the group",
    visualTone: "Flowing, directional, sector money movement.",
    designSystemColors: ["--violet-400", "--blue-400", "--violet-300"],
    severity: "positive",
    defaultIcon: Hurricane,
    dynamicGraphicKey: "rotation-current",
    recommendedUserMessage: "Capital appears to be rotating into this group.",
  },
  "calm-waters": {
    id: "calm-waters",
    label: "Calm Waters",
    shortLabel: "Calm",
    plainEnglishMeaning:
      "Conditions are stable and neutral. No major pressure either way.",
    scoringRule:
      "Score 46–60, price near VWAP/anchor, volume near normal, low volatility, no major catalyst",
    visualTone: "Calm, stable, patient.",
    designSystemColors: ["--blue-400", "--blue-300", "--ink-500"],
    severity: "neutral",
    defaultIcon: Anchor,
    dynamicGraphicKey: "calm-waters",
    recommendedUserMessage:
      "Conditions are stable. No major pressure is showing yet.",
  },
  "rogue-wave": {
    id: "rogue-wave",
    label: "Rogue Wave",
    shortLabel: "Rogue",
    plainEnglishMeaning:
      "Something abnormal is happening. The move is unusually large, fast, or catalyst-driven.",
    scoringRule:
      "Move > 1.5× normal daily range, OR volume > 200% of normal, OR major catalyst/news, OR unusually elevated options/volume",
    visualTone: "Sudden, unusual, high-alert, volatile.",
    designSystemColors: ["--violet-500", "--violet-400", "--amber-400"],
    severity: "alert",
    defaultIcon: Siren,
    dynamicGraphicKey: "rogue-wave",
    recommendedUserMessage:
      "An abnormal move is happening. Check the catalyst before reacting.",
  },
  "red-sky-warning": {
    id: "red-sky-warning",
    label: "Red Sky Warning",
    shortLabel: "Red Sky",
    plainEnglishMeaning: "Risk is rising before a full breakdown is obvious.",
    scoringRule:
      "Weather drops 12+ points in a day AND volatility rises AND breadth deteriorates, OR stock/sector loses support while market risk rises",
    visualTone: "Early danger, warning before storm.",
    designSystemColors: ["--red-400", "--brand-ember", "--amber-500"],
    severity: "warning",
    defaultIcon: WarningOctagon,
    dynamicGraphicKey: "red-sky-warning",
    recommendedUserMessage:
      "Conditions are deteriorating. Risk is rising before the full storm is obvious.",
  },
};

/** Convenience: ordered list of all condition definitions. */
export const WEATHER_CONDITION_LIST: WeatherConditionDefinition[] =
  Object.values(WEATHER_CONDITIONS);

export function getCondition(id: WeatherConditionId): WeatherConditionDefinition {
  return WEATHER_CONDITIONS[id];
}
