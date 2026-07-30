import { describe, expect, it } from "vitest";
import {
  atrUnitDistance,
  classifyWeatherV2,
  computeCoverage,
  computeInstrumentRisk,
  computeMarketParticipation,
  computeMarketRisk,
  computeMomentum,
  computeQqq200Support,
  computeRelativeStrength,
  computeRelativeStrengthImprovement,
  computeStructure,
  computeWeatherIndex,
  roundHalfUp,
  structureContribution,
} from "./scoringV2";
import type {
  ClassifyWeatherV2Inputs,
  WeatherV2Classification,
} from "./scoringV2Types";

const condition = (result: WeatherV2Classification) =>
  result.kind === "condition" ? result.conditionId : result.kind;

const market = (
  overrides: Partial<ClassifyWeatherV2Inputs> = {},
): ClassifyWeatherV2Inputs => {
  const pillars = overrides.pillars ?? {
    structure: 80,
    participation: 70,
    risk: 65,
    momentum: 60,
  };
  const index = computeWeatherIndex("market", pillars);
  if (!index) throw new Error("Market fixture requires at least one pillar");
  if (
    overrides.weatherIndex !== undefined &&
    Math.abs(overrides.weatherIndex - index.value) > 0.000_001
  ) {
    throw new Error("Market fixture Weather Index must match its pillars");
  }
  return {
    layer: "market",
    coverage: "complete",
    qqq200: computeQqq200Support(1.1),
    ...overrides,
    pillars,
    weatherIndex: index.value,
  };
};

describe("Weather V2 formulas", () => {
  it("uses ATR-unit distance bands and half-up rounding after aggregation", () => {
    expect(atrUnitDistance(100, 98, 2)).toBe(1);
    expect(structureContribution(1)).toBe(70);
    expect(structureContribution(1.00001)).toBe(90);
    expect(structureContribution(-0.25)).toBe(50);
    expect(structureContribution(-1)).toBe(30);
    expect(structureContribution(-1.00001)).toBe(10);
    expect(roundHalfUp(62.5)).toBe(63);

    const structure = computeStructure({
      price: 100,
      atrPct: 2,
      ema20: 98,
      sma50: 100,
      sma200: 102,
      ema10: 99,
    });
    // d: vsEMA20=1→70, vsSMA50=0→50, vsSMA200=-1→30, EMA10>EMA20→75 → mean 56.25
    expect(structure?.value).toBe(56.25);
    expect(structure?.score).toBe(56);
    expect(structure?.partial).toBe(false);
  });

  it("aggregates participation, market risk, momentum, RS, and instrument risk", () => {
    expect(computeMarketParticipation({
      rspMinusSpy5dPct: 1,
      iwmMinusSpy5dPct: -1,
      sectorSpdrOutperforming: 7 / 11,
      sectorSpdrOutperformingFreshCount: 11,
      sectorSpdrAboveSma50: 8 / 11,
      sectorSpdrAboveSma50FreshCount: 11,
    })?.score).toBe(59);
    expect(computeMarketRisk({ vix: 20, priorCompletedVix: 17, hyOas: 4 })?.score)
      .toBe(74);
    expect(computeMomentum({ rsi14: 60, change5dPct: 2 })?.score).toBe(59);
    expect(computeRelativeStrength({
      layer: "stock",
      rsVsSpy5d: 2,
      rsVsSpy20d: 3,
      rsVsSector5d: 1,
      rsVsSector20d: -1,
    })?.score).toBe(57);
    expect(computeRelativeStrengthImprovement(6, 3.5)).toBe(2.5);
    expect(computeInstrumentRisk({
      atrPct14d: 3,
      atrPctBaseline60d: 2,
      drawdownFrom20dHighPct: 5,
    })?.score).toBe(61);
  });

  it("renormalizes index weights over present pillars", () => {
    expect(computeWeatherIndex("market", {
      structure: 80,
      participation: 70,
      risk: 65,
      momentum: 60,
      relativeStrength: 0,
    })).toEqual({ value: 70.75, score: 71, weightTotal: 1 });
    const partialIndex = computeWeatherIndex("market", { structure: 80, risk: 40 });
    expect(partialIndex?.value).toBeCloseTo(63.3333333333);
    expect(partialIndex?.score).toBe(63);
    expect(partialIndex?.weightTotal).toBeCloseTo(0.6);
  });
});

describe("Weather V2 golden fixtures G1-G18", () => {
  it("G1: complete supportive Market is Risk-On Tide", () => {
    expect(condition(classifyWeatherV2(market()))).toBe("risk-on-tide");
  });

  it("G2: wide Market disagreement is Chop Seas, not Headwind", () => {
    expect(condition(classifyWeatherV2(market({
      pillars: { structure: 75, participation: 35, risk: 40, momentum: 50 },
    })))).toBe("chop-seas");
  });

  it("G3: broadly damaged Market is Risk-Off Storm", () => {
    expect(condition(classifyWeatherV2(market({
      pillars: { structure: 25, participation: 30, risk: 25, momentum: 30 },
    })))).toBe("risk-off-storm");
  });

  it("G4: VIX-only partial Market can still be Risk-On Tide", () => {
    const risk = computeMarketRisk({ vix: 22 });
    expect(risk?.partial).toBe(true);
    expect(condition(classifyWeatherV2(market({
      coverage: "partial",
      pillars: { structure: 80, participation: 70, risk: 65, momentum: 60 },
    })))).toBe("risk-on-tide");
  });

  it("G5: unavailable HY is omitted rather than neutralized", () => {
    // VIX-only Risk 25: 100 - (vix - 12) * 3.5 = 25 → vix = 12 + 75/3.5
    const risk = computeMarketRisk({ vix: 12 + 75 / 3.5 });
    expect(risk?.score).toBe(25);
    expect(risk?.partial).toBe(true);
    expect(condition(classifyWeatherV2(market({
      coverage: "partial",
      pillars: { structure: 25, participation: 30, risk: risk?.value, momentum: 30 },
      weatherIndex: 27,
    })))).toBe("risk-off-storm");
  });

  it("G6: weak parent backdrop creates Stock Headwind", () => {
    expect(condition(classifyWeatherV2({
      layer: "stock",
      coverage: "complete",
      pillars: {
        structure: 50,
        relativeStrength: 48,
        participation: 48,
        risk: 58,
        momentum: 56,
      },
      weatherIndex: 51.5,
      higherLayerIndex: 30,
    }))).toBe("headwind");
  });

  it("G7: no RSP and fewer than 6 fresh SPDRs is Market insufficient", () => {
    const participation = computeMarketParticipation({
      sectorSpdrOutperforming: 0.8,
      sectorSpdrOutperformingFreshCount: 5,
    });
    expect(participation).toBeNull();
    expect(computeCoverage({
      layer: "market",
      hasInstrument: true,
      hasMinimumStructure: true,
      marketHasRisk: true,
      marketHasFreshParticipation: false,
    })).toBe("insufficient");
  });

  it("G8: conflicting pillars classify as Chop Seas", () => {
    expect(condition(classifyWeatherV2(market({
      pillars: { structure: 80, risk: 25, participation: 50, momentum: 50 },
    })))).toBe("chop-seas");
  });

  it("G9: quiet, aligned Market earns Calm Waters", () => {
    expect(condition(classifyWeatherV2(market({
      pillars: { structure: 52, participation: 50, risk: 60, momentum: 50 },
    })))).toBe("calm-waters");
  });

  it("G10: Stock that misses every prior row falls to Mixed Signals", () => {
    expect(condition(classifyWeatherV2({
      layer: "stock",
      coverage: "complete",
      pillars: {
        structure: 64,
        relativeStrength: 45,
        participation: 45,
        risk: 65,
        momentum: 50,
      },
      weatherIndex: 56.15,
      higherLayerIndex: 50,
      substantiallyBelowStructureRelation: true,
    }))).toBe("mixed-signals");
  });

  it("G11: QQQ slightly below EMA200 contributes Market Headwind", () => {
    expect(condition(classifyWeatherV2(market({
      pillars: { structure: 48, participation: 50, risk: 55, momentum: 55 },
      qqq200: computeQqq200Support(-0.5),
    })))).toBe("headwind");
  });

  it("G12: exact confirmed QQQ break path emits Red Sky Warning", () => {
    expect(condition(classifyWeatherV2(market({
      pillars: { structure: 42, participation: 40, risk: 40, momentum: 50 },
      qqq200: computeQqq200Support(-1.2),
    })))).toBe("red-sky-warning");
  });

  it("G13: missing Industry ETF is unavailable, not Mixed Signals", () => {
    const result = classifyWeatherV2({
      layer: "industry",
      coverage: "insufficient",
      pillars: {},
      weatherIndex: 0,
    });
    expect(result).toEqual({
      kind: "industry-unavailable",
      coverage: "insufficient",
      reason: "independent-industry-weather-unavailable",
    });
  });

  it("G14: absent Rogue fields never fire Rogue Wave", () => {
    expect(condition(classifyWeatherV2(market()))).not.toBe("rogue-wave");
  });

  it("G15: complete Rogue range plus return path fires Rogue Wave", () => {
    expect(condition(classifyWeatherV2(market({
      dailyRangeMultiple: 1.8,
      absoluteReturnAtrMultiple: 1.1,
    })))).toBe("rogue-wave");
  });

  it("G16: absent Breakout fields never fire Breakout Wind", () => {
    expect(condition(classifyWeatherV2(market()))).not.toBe("breakout-wind");
  });

  it("G17: Sector prior-cycle RS improvement fires Rotation Current", () => {
    expect(condition(classifyWeatherV2({
      layer: "sector",
      coverage: "complete",
      pillars: { structure: 60, relativeStrength: 75, risk: 60, momentum: 55 },
      weatherIndex: 63,
      relativeStrengthImprovement: 6 - 3.5,
      hasPriorFreshV2Cycle: true,
    }))).toBe("rotation-current");
  });

  it("G18: missing mapped Sector SPDR is Sector insufficient only", () => {
    expect(computeCoverage({
      layer: "sector",
      hasInstrument: false,
      hasMinimumStructure: false,
    })).toBe("insufficient");
    expect(condition(classifyWeatherV2(market()))).toBe("risk-on-tide");
  });
});

describe("QQQ support and coverage precedence", () => {
  it("encodes near, cross-to-near headwind, and break flags exactly", () => {
    expect(computeQqq200Support(0.25)).toMatchObject({
      near: true,
      headwind: false,
      break: false,
      confidenceAdjustment: -2,
    });
    expect(computeQqq200Support(0.2, 0.6)).toMatchObject({
      near: true,
      headwind: true,
      break: false,
    });
    expect(computeQqq200Support(-1.01)).toMatchObject({
      near: false,
      headwind: false,
      break: true,
    });
  });

  it("uses insufficient, then provisional, then partial, then complete precedence", () => {
    expect(computeCoverage({
      layer: "market",
      hasInstrument: true,
      hasMinimumStructure: true,
      marketHasRisk: true,
      marketHasFreshParticipation: true,
      softBudgetPartial: true,
      optionalInputMissing: true,
    })).toBe("provisional");
    expect(computeCoverage({
      layer: "stock",
      hasInstrument: true,
      hasMinimumStructure: true,
      optionalInputMissing: true,
    })).toBe("partial");
    expect(computeCoverage({
      layer: "stock",
      hasInstrument: true,
      hasMinimumStructure: true,
    })).toBe("complete");
  });
});
