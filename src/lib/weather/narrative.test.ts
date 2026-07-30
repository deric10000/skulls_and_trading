import { describe, expect, it } from "vitest";
import { buildWeatherNarrative, type WeatherNarrativeFacts } from "./narrative";
import type { WeatherConditionId } from "./types";

const marketFacts: WeatherNarrativeFacts = {
  price: 620,
  ema10: 610,
  ema20: 600,
  sma50: 580,
  sma200: 530,
  rsi14: 61,
  vix: 16.4,
  sectorSpdrAboveSma50: 8 / 11,
  sectorSpdrAboveSma50FreshCount: 11,
  rspMinusSpy5dPct: -1.2,
  iwmMinusSpy5dPct: -0.8,
};

function narrative(
  conditionId: WeatherConditionId,
  facts: WeatherNarrativeFacts = marketFacts,
) {
  return buildWeatherNarrative({
    conditionId,
    layer: "market",
    label: "Market",
    coverage: "complete",
    facts,
  });
}

describe("Weather V2 user narrative", () => {
  it("translates every condition into market-native evidence, not pillar scores", () => {
    const factsByCondition: Record<WeatherConditionId, WeatherNarrativeFacts> = {
      "risk-on-tide": marketFacts,
      "risk-off-storm": { ...marketFacts, price: 500, rsi14: 34, vix: 29 },
      "chop-seas": marketFacts,
      "breakout-wind": { ...marketFacts, breakingResistance: true, volumeRatio: 1.4 },
      headwind: { ...marketFacts, price: 570, qqq200Headwind: true },
      tailwind: marketFacts,
      "rotation-current": {
        ...marketFacts,
        rsVsSpy5d: 2.2,
        rsVsSpy20d: 5.1,
        relativeStrengthImprovement: 2.6,
      },
      "calm-waters": { ...marketFacts, rsi14: 51, vix: 17 },
      "rogue-wave": {
        ...marketFacts,
        dailyRangeMultiple: 1.8,
        absoluteReturnAtrMultiple: 1.2,
        volumeRatio: 2.3,
      },
      "red-sky-warning": { ...marketFacts, qqq200Break: true },
      "mixed-signals": marketFacts,
    };

    for (const [conditionId, facts] of Object.entries(factsByCondition)) {
      const copy = narrative(conditionId as WeatherConditionId, facts);
      expect(copy.length).toBeGreaterThan(50);
      expect(copy).not.toMatch(
        /\b(Structure|Participation|Risk|Momentum) \d+\/100\b/,
      );
    }
  });

  it("explains a Rogue Wave with completed-cycle range, ATR, and volume", () => {
    const copy = narrative("rogue-wave", {
      dailyRangeMultiple: 1.8,
      absoluteReturnAtrMultiple: 1.2,
      volumeRatio: 2.3,
    });
    expect(copy).toContain("1.8× normal");
    expect(copy).toContain("1.2× its typical range");
    expect(copy).toContain("2.3× average");
  });

  it("changes deterministically when the next cycle changes its facts", () => {
    const first = narrative("risk-on-tide", { ...marketFacts, vix: 16.4 });
    const next = narrative("risk-on-tide", { ...marketFacts, vix: 26.2 });
    expect(first).toContain("contained at 16.4");
    expect(next).toContain("elevated at 26.2");
    expect(next).not.toBe(first);
  });

  it("uses stock and sector comparisons for a stock reading", () => {
    const copy = buildWeatherNarrative({
      conditionId: "tailwind",
      layer: "stock",
      label: "GOOG",
      coverage: "complete",
      facts: {
        price: 205,
        ema10: 201,
        ema20: 198,
        rsVsSector5d: 1.4,
        rsVsSector20d: 3.2,
        rsi14: 59,
      },
    });
    expect(copy).toContain("GOOG is above");
    expect(copy).toContain("outperforming its sector");
    expect(copy).toContain("RSI is 59");
  });

  it("does not invent evidence that is unavailable", () => {
    const copy = narrative("risk-on-tide", { vix: 17.2 });
    expect(copy).toContain("VIX");
    expect(copy).not.toContain("moving average");
    expect(copy).not.toContain("RSI");
  });

  it("explains unmapped Industry states directly", () => {
    expect(
      buildWeatherNarrative({
        conditionId: "mixed-signals",
        layer: "industry",
        label: "Interactive Media & Services",
        coverage: "insufficient",
        facts: {},
      }),
    ).toContain("approved industry ETF");
  });
});
