import type {
  ClassifyWeatherV2Inputs,
  CoverageInputs,
  InstrumentRiskInputs,
  MarketParticipationInputs,
  MarketRiskInputs,
  MomentumInputs,
  Qqq200Support,
  RelativeStrengthInputs,
  StructureInputs,
  StructureRelationScore,
  WeatherV2Classification,
  WeatherV2ConditionReason,
  WeatherV2Coverage,
  WeatherV2Layer,
  WeatherV2Pillars,
  WeatherV2PillarScore,
  VolumeParticipationInputs,
} from "./scoringV2Types";

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

/** Contract rounding: non-negative scores are rounded to nearest, ties upward. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

function present(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function aggregate(
  components: number[],
  expectedComponentCount: number,
): WeatherV2PillarScore | null {
  if (components.length === 0) return null;
  const value = components.reduce((sum, component) => sum + component, 0) /
    components.length;
  return {
    value,
    score: roundHalfUp(value),
    componentCount: components.length,
    partial: components.length < expectedComponentCount,
  };
}

export function atrUnitDistance(
  price: number | null | undefined,
  movingAverage: number | null | undefined,
  atrPct: number | null | undefined,
): number | null {
  if (!present(price) || price <= 0 || !present(movingAverage) ||
      !present(atrPct) || atrPct <= 0) {
    return null;
  }
  return (((price - movingAverage) / price) * 100) / atrPct;
}

export function structureContribution(distanceAtr: number): number {
  if (distanceAtr > 1) return 90;
  if (distanceAtr > 0.25) return 70;
  if (distanceAtr >= -0.25) return 50;
  if (distanceAtr >= -1) return 30;
  return 10;
}

export function computeStructure(
  inputs: StructureInputs,
): (WeatherV2PillarScore & {
  relations: StructureRelationScore[];
  hasMinimumRelation: boolean;
}) | null {
  const relations: StructureRelationScore[] = [];
  const addDistance = (
    relation: "short" | "sma50" | "sma200",
    movingAverage: number | null | undefined,
  ) => {
    const distanceAtr = atrUnitDistance(inputs.price, movingAverage, inputs.atrPct);
    if (distanceAtr === null) return;
    const score = structureContribution(distanceAtr);
    relations.push({
      relation,
      distanceAtr,
      score,
      substantiallyBelow: distanceAtr < -1,
    });
  };

  addDistance("short", present(inputs.ema20) ? inputs.ema20 : inputs.sma20);
  addDistance("sma50", inputs.sma50);
  addDistance("sma200", inputs.sma200);

  if (present(inputs.ema10) && present(inputs.ema20)) {
    relations.push({
      relation: "ema10OverEma20",
      score: inputs.ema10 > inputs.ema20 ? 75 : 25,
      substantiallyBelow: false,
    });
  }

  const aggregateScore = aggregate(relations.map(({ score }) => score), 4);
  if (!aggregateScore) return null;
  return {
    ...aggregateScore,
    relations,
    hasMinimumRelation: relations.some(
      ({ relation }) => relation === "short" || relation === "sma50",
    ),
  };
}

export function computeMarketParticipation(
  inputs: MarketParticipationInputs,
): WeatherV2PillarScore | null {
  const components: number[] = [];
  if (present(inputs.rspMinusSpy5dPct)) {
    components.push(clamp(50 + 8 * inputs.rspMinusSpy5dPct));
  }
  if (present(inputs.iwmMinusSpy5dPct)) {
    components.push(clamp(50 + 8 * inputs.iwmMinusSpy5dPct));
  }
  if (
    present(inputs.sectorSpdrOutperforming) &&
    (inputs.sectorSpdrOutperformingFreshCount ?? 0) >= 6
  ) {
    components.push(clamp(100 * inputs.sectorSpdrOutperforming));
  }
  if (
    present(inputs.sectorSpdrAboveSma50) &&
    (inputs.sectorSpdrAboveSma50FreshCount ?? 0) >= 6
  ) {
    components.push(clamp(100 * inputs.sectorSpdrAboveSma50));
  }
  return aggregate(components, 4);
}

export function computeMarketRisk(
  inputs: MarketRiskInputs,
): WeatherV2PillarScore | null {
  const components: number[] = [];
  if (present(inputs.vix)) {
    let vixHealth = clamp(100 - (inputs.vix - 12) * 3.5);
    if (present(inputs.priorCompletedVix)) {
      const delta = inputs.vix - inputs.priorCompletedVix;
      if (delta > 2) vixHealth -= 10;
      else if (delta < -2) vixHealth += 5;
      vixHealth = clamp(vixHealth);
    }
    components.push(vixHealth);
  }
  if (present(inputs.hyOas)) {
    components.push(clamp(100 - (inputs.hyOas - 3) * 15));
  }
  return aggregate(components, 2);
}

export function computeMomentum(
  inputs: MomentumInputs,
): WeatherV2PillarScore | null {
  const components: number[] = [];
  if (present(inputs.rsi14)) components.push(clamp(inputs.rsi14));
  if (present(inputs.change5dPct)) {
    components.push(clamp(50 + 4 * inputs.change5dPct));
  }
  return aggregate(components, 2);
}

export function computeVolumeParticipation(
  inputs: VolumeParticipationInputs,
): WeatherV2PillarScore | null {
  if (!present(inputs.relativeVolume) || inputs.relativeVolume < 0) return null;
  // 1× average volume is neutral; each ±1× moves participation by 25 points.
  return aggregate([clamp(50 + 25 * (inputs.relativeVolume - 1))], 1);
}

export function computeRelativeStrength(
  inputs: RelativeStrengthInputs,
): WeatherV2PillarScore | null {
  const components: number[] = [];
  if (present(inputs.rsVsSpy5d)) {
    components.push(clamp(50 + 6 * inputs.rsVsSpy5d));
  }
  if (present(inputs.rsVsSpy20d)) {
    components.push(clamp(50 + 4 * inputs.rsVsSpy20d));
  }
  if (inputs.layer === "stock") {
    if (present(inputs.rsVsSector5d)) {
      components.push(clamp(50 + 6 * inputs.rsVsSector5d));
    }
    if (present(inputs.rsVsSector20d)) {
      components.push(clamp(50 + 4 * inputs.rsVsSector20d));
    }
  }
  return aggregate(components, inputs.layer === "stock" ? 4 : 2);
}

export function computeRelativeStrengthImprovement(
  currentRsVsSpy20d: number | null | undefined,
  priorFreshV2RsVsSpy20d: number | null | undefined,
): number | null {
  if (!present(currentRsVsSpy20d) || !present(priorFreshV2RsVsSpy20d)) {
    return null;
  }
  return currentRsVsSpy20d - priorFreshV2RsVsSpy20d;
}

export function computeInstrumentRisk(
  inputs: InstrumentRiskInputs,
): WeatherV2PillarScore | null {
  const components: number[] = [];
  if (
    present(inputs.atrPct14d) &&
    present(inputs.atrPctBaseline60d) &&
    inputs.atrPctBaseline60d > 0
  ) {
    components.push(clamp(
      75 - 25 * (inputs.atrPct14d / inputs.atrPctBaseline60d - 1),
    ));
  }
  if (present(inputs.drawdownFrom20dHighPct)) {
    components.push(clamp(100 - 8 * inputs.drawdownFrom20dHighPct));
  }
  return aggregate(components, 2);
}

const INDEX_WEIGHTS: Record<
  WeatherV2Layer,
  Partial<Record<keyof WeatherV2Pillars, number>>
> = {
  market: { structure: 0.35, participation: 0.25, risk: 0.25, momentum: 0.15 },
  sector: { structure: 0.35, relativeStrength: 0.25, risk: 0.25, momentum: 0.15 },
  industry: { structure: 0.35, relativeStrength: 0.25, risk: 0.25, momentum: 0.15 },
  stock: {
    structure: 0.35,
    relativeStrength: 0.25,
    risk: 0.2,
    momentum: 0.1,
    participation: 0.1,
  },
};

export function computeWeatherIndex(
  layer: WeatherV2Layer,
  pillars: WeatherV2Pillars,
): { value: number; score: number; weightTotal: number } | null {
  const weights = INDEX_WEIGHTS[layer];
  let weighted = 0;
  let weightTotal = 0;
  for (const key of Object.keys(weights) as (keyof WeatherV2Pillars)[]) {
    const value = pillars[key];
    const weight = weights[key];
    if (present(value) && present(weight)) {
      weighted += value * weight;
      weightTotal += weight;
    }
  }
  if (weightTotal === 0) return null;
  const value = weighted / weightTotal;
  return { value, score: roundHalfUp(value), weightTotal };
}

export function computeCoverage(inputs: CoverageInputs): WeatherV2Coverage {
  if (!inputs.hasInstrument || !inputs.hasMinimumStructure) return "insufficient";
  if (
    inputs.layer === "market" &&
    (!inputs.marketHasRisk || !inputs.marketHasFreshParticipation)
  ) {
    return "insufficient";
  }
  if (inputs.softBudgetPartial) return "provisional";
  if (inputs.optionalInputMissing || inputs.allPreferredInputsFresh === false) {
    return "partial";
  }
  return "complete";
}

export function computeQqq200Support(
  currentDistanceAtr: number,
  priorFreshDistanceAtr?: number,
): Qqq200Support {
  const near = Math.abs(currentDistanceAtr) <= 0.25;
  const crossedIntoNear =
    present(priorFreshDistanceAtr) &&
    priorFreshDistanceAtr > 0.25 &&
    near &&
    currentDistanceAtr - priorFreshDistanceAtr <= -0.25;
  return {
    distanceAtr: currentDistanceAtr,
    near,
    headwind:
      (currentDistanceAtr >= -1 && currentDistanceAtr < -0.25) ||
      crossedIntoNear,
    break: currentDistanceAtr < -1,
    confidenceAdjustment: near ? -2 : 0,
  };
}

function confirmation(inputs: ClassifyWeatherV2Inputs): number | undefined {
  const { layer, pillars } = inputs;
  if (layer === "market") return pillars.participation;
  if (layer === "sector" || layer === "industry") return pillars.relativeStrength;
  const values = [pillars.relativeStrength, pillars.participation].filter(present);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function branded(
  coverage: Exclude<WeatherV2Coverage, "insufficient">,
  conditionId: Extract<WeatherV2Classification, { kind: "condition" }>["conditionId"],
  reason: WeatherV2ConditionReason,
): WeatherV2Classification {
  return { kind: "condition", coverage, conditionId, reason };
}

export function classifyWeatherV2(
  inputs: ClassifyWeatherV2Inputs,
): WeatherV2Classification {
  if (inputs.coverage === "insufficient") {
    return inputs.layer === "industry"
      ? {
          kind: "industry-unavailable",
          coverage: "insufficient",
          reason: "independent-industry-weather-unavailable",
        }
      : { kind: "insufficient", coverage: "insufficient" };
  }

  const coverage = inputs.coverage;
  const { pillars, weatherIndex } = inputs;
  const structure = pillars.structure;
  const risk = pillars.risk;
  const momentum = pillars.momentum;
  const confirm = confirmation(inputs);

  const rogue =
    present(inputs.dailyRangeMultiple) &&
    inputs.dailyRangeMultiple > 1.5 &&
    (
      (present(inputs.absoluteReturnAtrMultiple) &&
        inputs.absoluteReturnAtrMultiple >= 1) ||
      (present(inputs.volumeRatio) && inputs.volumeRatio > 2)
    );
  if (rogue) return branded(coverage, "rogue-wave", "rogue-move");

  const deteriorating =
    inputs.hasPriorFreshV2Cycle === true &&
    present(inputs.weatherIndexDelta) &&
    inputs.weatherIndexDelta <= -12 &&
    present(inputs.riskDelta) &&
    inputs.riskDelta <= -8 &&
    present(inputs.confirmationDelta) &&
    inputs.confirmationDelta <= -8;
  const backdropBreak =
    inputs.lostSupport === true &&
    present(inputs.higherLayerIndex) &&
    inputs.higherLayerIndex < 45;
  const qqqBreak =
    inputs.layer === "market" &&
    inputs.qqq200?.break === true &&
    present(pillars.participation) &&
    pillars.participation <= 45 &&
    present(risk) &&
    risk <= 45 &&
    present(structure) &&
    structure <= 45;
  if (deteriorating || backdropBreak || qqqBreak) {
    return branded(
      coverage,
      "red-sky-warning",
      deteriorating
        ? "cycle-deterioration"
        : backdropBreak
          ? "support-break-with-weak-parent"
          : "qqq-support-break",
    );
  }

  if (
    present(structure) &&
    structure >= 70 &&
    present(confirm) &&
    confirm >= 60 &&
    present(inputs.volumeRatio) &&
    inputs.volumeRatio >= 1.2 &&
    inputs.breakingResistance === true
  ) {
    return branded(coverage, "breakout-wind", "confirmed-breakout");
  }

  if (
    (inputs.layer === "sector" || inputs.layer === "industry") &&
    inputs.hasPriorFreshV2Cycle === true &&
    present(pillars.relativeStrength) &&
    pillars.relativeStrength >= 70 &&
    present(inputs.relativeStrengthImprovement) &&
    inputs.relativeStrengthImprovement >= 2 &&
    present(confirm) &&
    confirm >= 55
  ) {
    return branded(
      coverage,
      "rotation-current",
      "improving-relative-strength",
    );
  }

  if (
    weatherIndex <= 35 &&
    present(structure) &&
    structure <= 40 &&
    present(confirm) &&
    confirm <= 40 &&
    present(risk) &&
    risk <= 40
  ) {
    return branded(coverage, "risk-off-storm", "local-risk-off");
  }

  if (
    weatherIndex >= 65 &&
    present(structure) &&
    structure >= 60 &&
    present(confirm) &&
    confirm >= 55 &&
    present(risk) &&
    risk >= 45 &&
    present(momentum) &&
    momentum >= 55
  ) {
    return branded(coverage, "risk-on-tide", "local-risk-on");
  }

  const directHeadwind =
    weatherIndex < 45 &&
    (
      (present(structure) && structure < 45) ||
      (present(risk) && risk < 45) ||
      (present(confirm) && confirm < 45)
    );
  const higherLayerHeadwind =
    present(inputs.higherLayerIndex) &&
    inputs.higherLayerIndex < 45 &&
    weatherIndex < 55 &&
    (
      (present(structure) && structure < 52) ||
      (present(confirm) && confirm < 50)
    );
  const qqqHeadwind =
    inputs.layer === "market" &&
    inputs.qqq200?.headwind === true &&
    (
      (present(structure) && structure < 55) ||
      (present(pillars.participation) && pillars.participation < 50)
    );
  if (directHeadwind || higherLayerHeadwind || qqqHeadwind) {
    const reason: WeatherV2ConditionReason = qqqHeadwind
      ? "qqq-headwind"
      : directHeadwind && higherLayerHeadwind
        ? "local-and-parent-headwind"
        : higherLayerHeadwind
          ? "weak-parent-headwind"
          : "local-headwind";
    return branded(coverage, "headwind", reason);
  }

  const values = Object.values(pillars).filter(present);
  const spread = values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
  const hasSpecialtyEventFlag =
    inputs.breakingResistance === true ||
    (present(inputs.dailyRangeMultiple) && inputs.dailyRangeMultiple > 1.5) ||
    (present(inputs.absoluteReturnAtrMultiple) &&
      inputs.absoluteReturnAtrMultiple >= 1) ||
    (present(inputs.volumeRatio) && inputs.volumeRatio > 2) ||
    (
      present(inputs.relativeStrengthImprovement) &&
      inputs.relativeStrengthImprovement >= 2
    );
  const calm =
    (coverage === "complete" || coverage === "partial") &&
    weatherIndex >= 46 &&
    weatherIndex <= 60 &&
    spread < 25 &&
    present(risk) &&
    risk >= 55 &&
    present(momentum) &&
    Math.abs(momentum - 50) <= 12 &&
    inputs.substantiallyBelowStructureRelation !== true &&
    inputs.lostSupport !== true &&
    !hasSpecialtyEventFlag &&
    !(inputs.layer === "market" && inputs.qqq200?.break === true);
  if (calm) {
    return branded(coverage, "calm-waters", "balanced-local-conditions");
  }

  if (
    weatherIndex >= 55 &&
    weatherIndex < 65 &&
    present(structure) &&
    structure >= 52 &&
    present(risk) &&
    risk >= 48 &&
    present(confirm) &&
    confirm >= 48 &&
    !(inputs.layer === "market" && inputs.qqq200?.headwind === true)
  ) {
    return branded(coverage, "tailwind", "constructive-local-conditions");
  }

  const indexRangeChop = weatherIndex >= 45 && weatherIndex <= 55;
  const pillarDisagreementChop = spread >= 35;
  if (indexRangeChop || pillarDisagreementChop) {
    return branded(
      coverage,
      "chop-seas",
      indexRangeChop && pillarDisagreementChop
        ? "index-range-and-pillar-disagreement-chop"
        : indexRangeChop
          ? "index-range-chop"
          : "pillar-disagreement-chop",
    );
  }

  return branded(coverage, "mixed-signals", "no-prior-condition-matched");
}
