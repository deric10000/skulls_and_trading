import { WEATHER_CONDITIONS } from "./conditions";
import type {
  MarketWeatherLayer,
  WeatherConditionId,
  WeatherCoverage,
} from "./types";

export interface WeatherNarrativeFacts {
  price?: number;
  ema10?: number;
  ema20?: number;
  sma50?: number;
  sma200?: number;
  rsi14?: number;
  return5dPct?: number;
  rsVsSpy5d?: number;
  rsVsSpy20d?: number;
  rsVsSector5d?: number;
  rsVsSector20d?: number;
  relativeStrengthImprovement?: number;
  volumeRatio?: number;
  dailyRangeMultiple?: number;
  absoluteReturnAtrMultiple?: number;
  atrPct?: number;
  atrPctBaseline60d?: number;
  vix?: number;
  rspMinusSpy5dPct?: number;
  iwmMinusSpy5dPct?: number;
  sectorSpdrOutperforming?: number;
  sectorSpdrOutperformingFreshCount?: number;
  sectorSpdrAboveSma50?: number;
  sectorSpdrAboveSma50FreshCount?: number;
  breakingResistance?: boolean;
  lostSupport?: boolean;
  higherLayerIndex?: number;
  qqq200Headwind?: boolean;
  qqq200Break?: boolean;
}

const finite = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const pct = (value: number) => `${Math.abs(value).toFixed(1)}%`;
const multiple = (value: number) => `${value.toFixed(1)}×`;

function subject(layer: MarketWeatherLayer, label: string): string {
  if (layer === "market") return "The S&P 500";
  if (layer === "stock") return label;
  return `The ${label} benchmark`;
}

function movingAverageClause(
  layer: MarketWeatherLayer,
  label: string,
  facts: WeatherNarrativeFacts,
): string | null {
  if (!finite(facts.price)) return null;
  const levels = [
    ["10-day EMA", facts.ema10],
    ["20-day EMA", facts.ema20],
    ["50-day moving average", facts.sma50],
    ["200-day moving average", facts.sma200],
  ] as const;
  const present: Array<readonly [string, number]> = levels.flatMap(
    ([name, value]) => (finite(value) ? [[name, value] as const] : []),
  );
  if (present.length === 0) return null;
  const above = present.filter(([, value]) => facts.price! >= value);
  const below = present.filter(([, value]) => facts.price! < value);
  const selected = above.length >= below.length ? above : below;
  const relation = above.length >= below.length ? "above" : "below";
  const names = selected.map(([name]) => name);
  const formatted =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${subject(layer, label)} is ${relation} its ${formatted}`;
}

function momentumClause(facts: WeatherNarrativeFacts): string | null {
  if (finite(facts.rsi14)) {
    const state =
      facts.rsi14 >= 70
        ? "overbought territory"
        : facts.rsi14 <= 30
          ? "oversold territory"
          : facts.rsi14 >= 55
            ? "positive momentum"
            : facts.rsi14 <= 45
              ? "weak momentum"
              : "neutral momentum";
    return `RSI is ${Math.round(facts.rsi14)}, showing ${state}`;
  }
  if (!finite(facts.return5dPct)) return null;
  return `price has ${facts.return5dPct >= 0 ? "gained" : "declined"} ${pct(facts.return5dPct)} over five trading days`;
}

function participationClause(facts: WeatherNarrativeFacts): string | null {
  if (
    finite(facts.sectorSpdrAboveSma50) &&
    finite(facts.sectorSpdrAboveSma50FreshCount)
  ) {
    const count = Math.round(
      facts.sectorSpdrAboveSma50 * facts.sectorSpdrAboveSma50FreshCount,
    );
    return `${count} of ${facts.sectorSpdrAboveSma50FreshCount} major sectors are above their 50-day moving averages`;
  }
  if (
    finite(facts.sectorSpdrOutperforming) &&
    finite(facts.sectorSpdrOutperformingFreshCount)
  ) {
    const count = Math.round(
      facts.sectorSpdrOutperforming *
        facts.sectorSpdrOutperformingFreshCount,
    );
    return `${count} of ${facts.sectorSpdrOutperformingFreshCount} major sectors are outperforming the S&P 500`;
  }
  return null;
}

function relativeStrengthClause(
  layer: MarketWeatherLayer,
  facts: WeatherNarrativeFacts,
): string | null {
  const five =
    layer === "stock" && finite(facts.rsVsSector5d)
      ? { value: facts.rsVsSector5d, comparison: "its sector" }
      : finite(facts.rsVsSpy5d)
        ? { value: facts.rsVsSpy5d, comparison: "the S&P 500" }
        : null;
  const twenty =
    layer === "stock" && finite(facts.rsVsSector20d)
      ? { value: facts.rsVsSector20d, comparison: "its sector" }
      : finite(facts.rsVsSpy20d)
        ? { value: facts.rsVsSpy20d, comparison: "the S&P 500" }
        : null;
  if (five && twenty) {
    const direction =
      five.value >= 0 && twenty.value >= 0
        ? "outperforming"
        : five.value < 0 && twenty.value < 0
          ? "trailing"
          : "showing mixed performance against";
    return `${direction} ${five.comparison} over both five and 20 trading days`;
  }
  const available = five ?? twenty;
  return available
    ? `${available.value >= 0 ? "outperforming" : "trailing"} ${available.comparison} by ${pct(available.value)}`
    : null;
}

function volatilityClause(facts: WeatherNarrativeFacts): string | null {
  if (finite(facts.vix)) {
    const state =
      facts.vix < 18 ? "contained" : facts.vix >= 25 ? "elevated" : "moderate";
    return `the VIX is ${state} at ${facts.vix.toFixed(1)}`;
  }
  if (
    finite(facts.atrPct) &&
    finite(facts.atrPctBaseline60d) &&
    facts.atrPctBaseline60d > 0
  ) {
    const ratio = facts.atrPct / facts.atrPctBaseline60d;
    return `volatility is ${ratio > 1.15 ? "above" : ratio < 0.85 ? "below" : "near"} its 60-day norm`;
  }
  return null;
}

function joinClauses(clauses: Array<string | null>, limit = 3): string {
  const selected = clauses
    .filter((clause): clause is string => Boolean(clause))
    .slice(0, limit);
  if (selected.length === 0) return "";
  if (selected.length === 1) return selected[0];
  return `${selected.slice(0, -1).join(", ")}, and ${selected.at(-1)}`;
}

function evidenceSentence(
  conditionId: WeatherConditionId,
  layer: MarketWeatherLayer,
  label: string,
  facts: WeatherNarrativeFacts,
): string {
  const structure = movingAverageClause(layer, label, facts);
  const momentum = momentumClause(facts);
  const participation = layer === "market" ? participationClause(facts) : null;
  const relativeStrength = relativeStrengthClause(layer, facts);
  const volatility = volatilityClause(facts);

  switch (conditionId) {
    case "rogue-wave":
      return joinClauses([
        finite(facts.dailyRangeMultiple)
          ? `today's range is ${multiple(facts.dailyRangeMultiple)} normal`
          : null,
        finite(facts.absoluteReturnAtrMultiple)
          ? `the price move has reached ${multiple(facts.absoluteReturnAtrMultiple)} its typical range`
          : null,
        finite(facts.volumeRatio)
          ? `volume is running at ${multiple(facts.volumeRatio)} average`
          : null,
      ]);
    case "red-sky-warning":
      if (facts.qqq200Break) {
        return joinClauses([
          "the Nasdaq 100 has broken materially below its 200-day moving average",
          participation,
          volatility,
        ]);
      }
      if (facts.lostSupport) {
        return joinClauses([
          `${subject(layer, label)} has lost technical support`,
          finite(facts.higherLayerIndex) && facts.higherLayerIndex < 45
            ? "the surrounding market backdrop is weak"
            : null,
          momentum,
        ]);
      }
      return joinClauses([structure, participation, volatility, momentum]);
    case "breakout-wind":
      return joinClauses([
        `${subject(layer, label)} has broken above recent resistance`,
        finite(facts.volumeRatio)
          ? `volume is ${multiple(facts.volumeRatio)} average`
          : null,
        relativeStrength,
        momentum,
      ]);
    case "rotation-current":
      return joinClauses([
        relativeStrength,
        finite(facts.relativeStrengthImprovement)
          ? `relative performance has improved by ${facts.relativeStrengthImprovement.toFixed(1)} points since the previous completed cycle`
          : null,
        momentum,
      ]);
    case "headwind":
      return joinClauses([
        structure,
        relativeStrength,
        finite(facts.higherLayerIndex) && facts.higherLayerIndex < 45
          ? "the surrounding market backdrop is weak"
          : facts.qqq200Headwind
            ? "the Nasdaq 100 is below its 200-day moving average"
            : null,
        momentum,
      ]);
    case "chop-seas":
      return joinClauses([
        structure,
        finite(facts.rspMinusSpy5dPct) && facts.rspMinusSpy5dPct < 0
          ? `equal-weight stocks are trailing the S&P 500 by ${pct(facts.rspMinusSpy5dPct)} over five days`
          : finite(facts.iwmMinusSpy5dPct) && facts.iwmMinusSpy5dPct < 0
            ? `small caps are trailing the S&P 500 by ${pct(facts.iwmMinusSpy5dPct)} over five days`
            : null,
        relativeStrength,
        momentum,
        volatility,
      ]);
    case "risk-on-tide":
    case "risk-off-storm":
    case "tailwind":
    case "calm-waters":
    case "mixed-signals":
      return joinClauses([
        structure,
        participation,
        relativeStrength,
        volatility,
        momentum,
      ]);
  }
}

export function buildWeatherNarrative(args: {
  conditionId: WeatherConditionId;
  layer: MarketWeatherLayer;
  label: string;
  coverage: WeatherCoverage;
  facts: WeatherNarrativeFacts;
}): string {
  if (args.coverage === "insufficient") {
    return args.layer === "industry"
      ? "Independent Industry Weather is unavailable until an approved industry ETF is mapped."
      : "There is not enough fresh market evidence to issue a weather condition yet.";
  }
  const meaning = WEATHER_CONDITIONS[args.conditionId].plainEnglishMeaning;
  const evidence = evidenceSentence(
    args.conditionId,
    args.layer,
    args.label,
    args.facts,
  );
  return evidence ? `${meaning} ${evidence}.` : meaning;
}
