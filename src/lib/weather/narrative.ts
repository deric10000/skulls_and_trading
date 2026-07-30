import type {
  MarketWeatherLayer,
  WeatherConditionId,
  WeatherCoverage,
  WeatherDataPoint,
} from "./types";

export interface WeatherNarrativeFacts {
  /** Named parent context for user-facing layer relationships. */
  parentLabel?: string;
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
  qqqPrice?: number;
  qqqEma200?: number;
  qqq200Headwind?: boolean;
  qqq200Break?: boolean;
}

const finite = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const pct = (value: number) => `${Math.abs(value).toFixed(1)}%`;
const multiple = (value: number) => `${value.toFixed(1)}×`;
const price = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const signedPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function averageDetail(
  name: string,
  average: number,
  currentPrice: number | undefined,
  horizon: "short-term" | "intermediate-term" | "long-term",
): string {
  const definition = `${name} smooths price over that period to show the ${horizon} trend.`;
  if (!finite(currentPrice) || average <= 0) return definition;
  const distance = ((currentPrice - average) / average) * 100;
  const relation = distance >= 0 ? "above" : "below";
  const implication =
    distance >= 0
      ? `${horizon} price action is holding above its recent trend`
      : `${horizon} price action is running below its recent trend`;
  return `${definition} Price is ${Math.abs(distance).toFixed(1)}% ${relation} this level, indicating ${implication}.`;
}

function rsiDetail(value: number): string {
  const state =
    value >= 70
      ? "momentum is elevated and commonly described as overbought"
      : value <= 30
        ? "momentum is depressed and commonly described as oversold"
        : value >= 55
          ? "momentum is positive"
          : value <= 45
            ? "momentum is weak"
            : "momentum is neutral";
  return `RSI measures the speed and persistence of recent price moves on a 0–100 scale. At ${value.toFixed(1)}, ${state}.`;
}

function namedSubject(layer: MarketWeatherLayer, label: string): string {
  return layer === "market" ? "The broader market" : label;
}

function contextualMeaning(
  conditionId: WeatherConditionId,
  layer: MarketWeatherLayer,
  label: string,
  facts: WeatherNarrativeFacts,
): string {
  const name = namedSubject(layer, label);
  switch (conditionId) {
    case "risk-on-tide":
      return `${name} has broadly supportive conditions. Buyers are participating and volatility remains manageable.`;
    case "risk-off-storm":
      return `${name} is under broad selling pressure.`;
    case "chop-seas":
      return `${name} is mixed, unstable, or directionless. Moves are more prone to false starts.`;
    case "breakout-wind":
      return `${name} is pushing through resistance with volume and participation.`;
    case "headwind":
      if (layer === "market") {
        return facts.qqq200Headwind
          ? "The broader market is facing pressure from weakness in large-cap growth."
          : "The broader market is facing pressure.";
      }
      if (layer === "sector") {
        return `${label} is facing pressure from the broader market.`;
      }
      if (facts.parentLabel) {
        return `${label} is facing pressure from the ${facts.parentLabel} sector.`;
      }
      return `${label} is facing pressure from its broader market backdrop.`;
    case "tailwind":
      return `${name} has a supportive backdrop, although momentum is not yet explosive.`;
    case "rotation-current":
      return `Capital is strengthening in ${layer === "market" ? "the broader market" : label}.`;
    case "calm-waters":
      return `${name} has stable, balanced conditions without major pressure in either direction.`;
    case "rogue-wave":
      return `${name} is making an unusually large or fast move.`;
    case "red-sky-warning":
      return `${name} is showing rising risk before a full breakdown is obvious.`;
    case "mixed-signals":
      return `${name} does not have a clear directional signal yet.`;
  }
}

function contextualSummaryMeaning(
  conditionId: WeatherConditionId,
  layer: MarketWeatherLayer,
  label: string,
  facts: WeatherNarrativeFacts,
): string {
  const name = namedSubject(layer, label);
  switch (conditionId) {
    case "risk-on-tide":
      return `${name} has broadly supportive conditions.`;
    case "risk-off-storm":
      return `${name} is under broad selling pressure.`;
    case "chop-seas":
      return `${name} has mixed signals pulling in different directions.`;
    case "breakout-wind":
      return `${name} is breaking resistance with confirmation.`;
    case "headwind":
      return contextualMeaning(conditionId, layer, label, facts);
    case "tailwind":
      return `${name} has a constructive backdrop.`;
    case "rotation-current":
      return `Capital is strengthening in ${layer === "market" ? "the broader market" : label}.`;
    case "calm-waters":
      return `${name} has stable, balanced conditions.`;
    case "rogue-wave":
      return `${name} is making an unusually large move.`;
    case "red-sky-warning":
      return `${name} is showing deteriorating conditions.`;
    case "mixed-signals":
      return `${name} does not have a clear directional signal yet.`;
  }
}

function subject(layer: MarketWeatherLayer, label: string): string {
  if (layer === "market") return "The S&P 500";
  return label;
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

function summaryEvidence(
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
        finite(facts.volumeRatio)
          ? `volume is ${multiple(facts.volumeRatio)} average`
          : finite(facts.absoluteReturnAtrMultiple)
            ? `the move has reached ${multiple(facts.absoluteReturnAtrMultiple)} its typical range`
            : null,
      ], 2);
    case "red-sky-warning":
      if (facts.qqq200Break) {
        return "the Nasdaq 100 has broken materially below its 200-day moving average";
      }
      if (facts.lostSupport) {
        return `${subject(layer, label)} has lost technical support`;
      }
      return joinClauses([structure, participation, volatility, momentum], 1);
    case "breakout-wind":
      return joinClauses([
        `${subject(layer, label)} has broken above recent resistance`,
        finite(facts.volumeRatio)
          ? `volume is ${multiple(facts.volumeRatio)} average`
          : null,
      ], 2);
    case "rotation-current":
      return joinClauses([
        relativeStrength,
        finite(facts.relativeStrengthImprovement)
          ? `relative performance improved ${facts.relativeStrengthImprovement.toFixed(1)} points since the prior cycle`
          : null,
      ], 2);
    case "headwind":
      return joinClauses([
        structure,
        finite(facts.higherLayerIndex) && facts.higherLayerIndex < 45
          ? "the surrounding market backdrop is weak"
          : facts.qqq200Headwind
            ? "the Nasdaq 100 is below its 200-day moving average"
            : null,
        relativeStrength,
      ], 2);
    case "chop-seas":
      return joinClauses([
        finite(facts.rspMinusSpy5dPct) && facts.rspMinusSpy5dPct < 0
          ? `equal-weight stocks trail the S&P 500 by ${pct(facts.rspMinusSpy5dPct)} over five days`
          : finite(facts.iwmMinusSpy5dPct) && facts.iwmMinusSpy5dPct < 0
            ? `small caps trail the S&P 500 by ${pct(facts.iwmMinusSpy5dPct)} over five days`
            : null,
        structure,
        relativeStrength,
        momentum,
      ], 1);
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
      ], 1);
  }
}

export function buildWeatherSummary(args: {
  conditionId: WeatherConditionId;
  layer: MarketWeatherLayer;
  label: string;
  coverage: WeatherCoverage;
  facts: WeatherNarrativeFacts;
}): string {
  if (args.coverage === "insufficient") {
    return args.layer === "industry"
      ? "Independent Industry Weather is unavailable until an approved industry ETF is mapped."
      : "Waiting for enough fresh evidence to issue this Weather reading.";
  }
  const evidence = summaryEvidence(
    args.conditionId,
    args.layer,
    args.label,
    args.facts,
  );
  const meaning = contextualSummaryMeaning(
    args.conditionId,
    args.layer,
    args.label,
    args.facts,
  );
  return evidence
    ? `${meaning} ${evidence}.`
    : meaning;
}

function distanceFromAveragePct(price: number, average: number): number {
  return ((price - average) / average) * 100;
}

function trendRelation(value: number): string {
  return `${Math.abs(value).toFixed(1)}% ${value >= 0 ? "above" : "below"}`;
}

export function buildLongTermTrend(args: {
  layer: MarketWeatherLayer;
  label: string;
  coverage: WeatherCoverage;
  facts: WeatherNarrativeFacts;
}): string | null {
  if (args.layer === "industry" && args.coverage === "insufficient") {
    return "A reliable long-term trend is not available for this industry.";
  }

  const { facts } = args;
  if (args.layer === "market") {
    const spyDistance =
      finite(facts.price) && finite(facts.sma200) && facts.sma200 > 0
        ? distanceFromAveragePct(facts.price, facts.sma200)
        : null;
    const qqqDistance =
      finite(facts.qqqPrice) &&
      finite(facts.qqqEma200) &&
      facts.qqqEma200 > 0
        ? distanceFromAveragePct(facts.qqqPrice, facts.qqqEma200)
        : null;
    const clauses = [
      spyDistance == null
        ? null
        : `The S&P 500 is ${trendRelation(spyDistance)} its 200-day SMA.`,
      qqqDistance == null
        ? null
        : `The Nasdaq 100 is ${trendRelation(qqqDistance)} its 200-day EMA.`,
    ].filter((clause): clause is string => Boolean(clause));
    return clauses.length > 0 ? clauses.join(" ") : null;
  }

  if (!finite(facts.price) || !finite(facts.sma200) || facts.sma200 <= 0) {
    return null;
  }
  const distance = distanceFromAveragePct(facts.price, facts.sma200);
  const shortTermWeakness =
    finite(facts.ema10) &&
    finite(facts.ema20) &&
    facts.price < facts.ema10 &&
    facts.price < facts.ema20;
  const shortTermStrength =
    finite(facts.ema10) &&
    finite(facts.ema20) &&
    facts.price > facts.ema10 &&
    facts.price > facts.ema20;
  const context =
    distance >= 0 && shortTermWeakness
      ? " despite short-term weakness"
      : distance < 0 && shortTermStrength
        ? " despite short-term strength"
        : "";
  return `${args.label} is ${trendRelation(distance)} its 200-day SMA${context}.`;
}

export function buildWeatherDataPoints(args: {
  layer: MarketWeatherLayer;
  label: string;
  facts: WeatherNarrativeFacts;
}): WeatherDataPoint[] {
  const { facts } = args;
  const name = namedSubject(args.layer, args.label);
  const points: Array<WeatherDataPoint | null> = [
    finite(facts.price)
      ? { label: "Price", value: price(facts.price), detail: `${name}'s latest completed-cycle price used by this Weather reading.` }
      : null,
    finite(facts.ema10)
      ? { label: "10-day EMA", value: price(facts.ema10), detail: averageDetail("The 10-day exponential moving average", facts.ema10, facts.price, "short-term") }
      : null,
    finite(facts.ema20)
      ? { label: "20-day EMA", value: price(facts.ema20), detail: averageDetail("The 20-day exponential moving average", facts.ema20, facts.price, "short-term") }
      : null,
    finite(facts.sma50)
      ? { label: "50-day SMA", value: price(facts.sma50), detail: averageDetail("The 50-day simple moving average", facts.sma50, facts.price, "intermediate-term") }
      : null,
    finite(facts.sma200)
      ? { label: "200-day SMA", value: price(facts.sma200), detail: averageDetail("The 200-day simple moving average", facts.sma200, facts.price, "long-term") }
      : null,
    finite(facts.rsi14)
      ? { label: "RSI (14)", value: facts.rsi14.toFixed(1), detail: rsiDetail(facts.rsi14) }
      : null,
    finite(facts.return5dPct)
      ? { label: "5-day return", value: signedPct(facts.return5dPct), detail: `${name} has ${facts.return5dPct >= 0 ? "gained" : "declined"} ${pct(facts.return5dPct)} over the latest five completed sessions, showing the direction and strength of the recent move.` }
      : null,
    finite(facts.rsVsSector5d)
      ? { label: "5-day RS vs sector", value: signedPct(facts.rsVsSector5d), detail: `Over five sessions, ${args.label} has ${facts.rsVsSector5d >= 0 ? "outperformed" : "trailed"} its sector benchmark by ${pct(facts.rsVsSector5d)}.` }
      : finite(facts.rsVsSpy5d)
        ? { label: "5-day RS vs S&P 500", value: signedPct(facts.rsVsSpy5d), detail: `Over five sessions, ${name} has ${facts.rsVsSpy5d >= 0 ? "outperformed" : "trailed"} the S&P 500 by ${pct(facts.rsVsSpy5d)}.` }
        : null,
    finite(facts.rsVsSector20d)
      ? { label: "20-day RS vs sector", value: signedPct(facts.rsVsSector20d), detail: `Over 20 sessions, ${args.label} has ${facts.rsVsSector20d >= 0 ? "outperformed" : "trailed"} its sector benchmark by ${pct(facts.rsVsSector20d)}.` }
      : finite(facts.rsVsSpy20d)
        ? { label: "20-day RS vs S&P 500", value: signedPct(facts.rsVsSpy20d), detail: `Over 20 sessions, ${name} has ${facts.rsVsSpy20d >= 0 ? "outperformed" : "trailed"} the S&P 500 by ${pct(facts.rsVsSpy20d)}.` }
        : null,
    finite(facts.volumeRatio)
      ? { label: "Relative volume", value: multiple(facts.volumeRatio), detail: `Volume is running at ${multiple(facts.volumeRatio)} its recent average, indicating ${facts.volumeRatio >= 1.2 ? "stronger-than-normal participation" : facts.volumeRatio < 0.8 ? "lighter-than-normal participation" : "roughly normal participation"} in the move.` }
      : null,
    finite(facts.dailyRangeMultiple)
      ? { label: "Daily range", value: multiple(facts.dailyRangeMultiple), detail: `The latest completed daily range is ${multiple(facts.dailyRangeMultiple)} its typical range, indicating ${facts.dailyRangeMultiple > 1.5 ? "an unusually large session" : facts.dailyRangeMultiple < 0.8 ? "a relatively quiet session" : "a range near normal conditions"}.` }
      : null,
    finite(facts.absoluteReturnAtrMultiple)
      ? { label: "Price move vs ATR", value: multiple(facts.absoluteReturnAtrMultiple), detail: `${name}'s absolute price move is ${multiple(facts.absoluteReturnAtrMultiple)} its Average True Range, showing ${facts.absoluteReturnAtrMultiple >= 1 ? "a move at least as large as its typical daily movement" : "a move within its typical daily movement"}.` }
      : null,
    finite(facts.atrPct)
      ? { label: "ATR (14)", value: `${facts.atrPct.toFixed(1)}%`, detail: finite(facts.atrPctBaseline60d) && facts.atrPctBaseline60d > 0 ? `${name}'s Average True Range is ${facts.atrPct.toFixed(1)}% of price, which is ${(facts.atrPct / facts.atrPctBaseline60d).toFixed(1)}× its 60-day norm. This measures typical movement size, not direction.` : `${name}'s Average True Range is ${facts.atrPct.toFixed(1)}% of price. This measures typical movement size, not direction.` }
      : null,
    finite(facts.vix)
      ? { label: "VIX", value: facts.vix.toFixed(1), detail: `The VIX reflects expected S&P 500 volatility. At ${facts.vix.toFixed(1)}, market volatility is ${facts.vix < 18 ? "contained" : facts.vix >= 25 ? "elevated" : "moderate"}.` }
      : null,
    finite(facts.rspMinusSpy5dPct)
      ? { label: "Equal weight vs S&P 500", value: signedPct(facts.rspMinusSpy5dPct), detail: "Five-session RSP performance minus S&P 500 performance." }
      : null,
    finite(facts.iwmMinusSpy5dPct)
      ? { label: "Small caps vs S&P 500", value: signedPct(facts.iwmMinusSpy5dPct), detail: "Five-session Russell 2000 performance minus S&P 500 performance." }
      : null,
    finite(facts.sectorSpdrAboveSma50) &&
    finite(facts.sectorSpdrAboveSma50FreshCount)
      ? {
          label: "Sectors above 50-day SMA",
          value: `${Math.round(facts.sectorSpdrAboveSma50 * facts.sectorSpdrAboveSma50FreshCount)}/${facts.sectorSpdrAboveSma50FreshCount}`,
          detail: `${Math.round(facts.sectorSpdrAboveSma50 * facts.sectorSpdrAboveSma50FreshCount)} of ${facts.sectorSpdrAboveSma50FreshCount} fresh major-sector benchmarks are above their 50-day moving averages, indicating ${facts.sectorSpdrAboveSma50 >= 0.6 ? "broad intermediate participation" : facts.sectorSpdrAboveSma50 < 0.4 ? "narrow intermediate participation" : "mixed intermediate participation"}.`,
        }
      : null,
    finite(facts.sectorSpdrOutperforming) &&
    finite(facts.sectorSpdrOutperformingFreshCount)
      ? {
          label: "Sectors outperforming",
          value: `${Math.round(facts.sectorSpdrOutperforming * facts.sectorSpdrOutperformingFreshCount)}/${facts.sectorSpdrOutperformingFreshCount}`,
          detail: `${Math.round(facts.sectorSpdrOutperforming * facts.sectorSpdrOutperformingFreshCount)} of ${facts.sectorSpdrOutperformingFreshCount} fresh major-sector benchmarks are outperforming the S&P 500 over five sessions, indicating ${facts.sectorSpdrOutperforming >= 0.6 ? "broad participation" : facts.sectorSpdrOutperforming < 0.4 ? "narrow leadership" : "mixed leadership"}.`,
        }
      : null,
    facts.breakingResistance
      ? { label: "Resistance break", value: "Confirmed", detail: "Completed-bar evidence confirms a break above recent resistance." }
      : null,
    facts.lostSupport
      ? { label: "Support loss", value: "Confirmed", detail: "Completed-bar evidence confirms a loss of technical support." }
      : null,
    args.layer === "market" && finite(facts.qqqPrice)
      ? { label: "Nasdaq-100 price", value: price(facts.qqqPrice), detail: "Latest completed-cycle Nasdaq-100 benchmark price." }
      : null,
    args.layer === "market" && finite(facts.qqqEma200)
      ? { label: "Nasdaq-100 200-day EMA", value: price(facts.qqqEma200), detail: averageDetail("The Nasdaq-100 200-day exponential moving average", facts.qqqEma200, facts.qqqPrice, "long-term") }
      : null,
  ];
  return points.filter((point): point is WeatherDataPoint => point != null);
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
  const meaning = contextualMeaning(
    args.conditionId,
    args.layer,
    args.label,
    args.facts,
  );
  const evidence = evidenceSentence(
    args.conditionId,
    args.layer,
    args.label,
    args.facts,
  );
  return evidence ? `${meaning} ${evidence}.` : meaning;
}
