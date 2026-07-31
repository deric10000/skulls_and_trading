import { describe, expect, it } from "vitest";
import {
  buildLongTermTrend,
  buildWeatherDataPoints,
  buildWeatherNarrative,
  buildWeatherSummary,
  type WeatherNarrativeFacts,
} from "./narrative";
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
      const summary = buildWeatherSummary({
        conditionId: conditionId as WeatherConditionId,
        layer: "market",
        label: "Market",
        coverage: "complete",
        facts,
      });
      expect(copy.length).toBeGreaterThan(50);
      expect(summary.length).toBeGreaterThan(30);
      expect(summary.length).toBeLessThan(copy.length);
      expect(copy).not.toMatch(
        /\b(Structure|Participation|Risk|Momentum) \d+\/100\b/,
      );
      expect(summary).not.toMatch(
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

  it("summarizes the same Rogue Wave facts without slicing the detail copy", () => {
    const facts = {
      dailyRangeMultiple: 1.8,
      absoluteReturnAtrMultiple: 1.5,
      volumeRatio: 1.5,
    };
    const summary = buildWeatherSummary({
      conditionId: "rogue-wave",
      layer: "market",
      label: "Market",
      coverage: "complete",
      facts,
    });
    const detail = narrative("rogue-wave", facts);
    expect(summary).toContain("1.8× normal");
    expect(summary).toContain("1.5× average");
    expect(detail).toContain("1.5× its typical range");
    expect(detail.startsWith(summary)).toBe(false);
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

  it("attributes a local Stock Headwind to the stock, not its supportive parent", () => {
    const facts: WeatherNarrativeFacts = {
      parentLabel: "Communication Services",
      price: 335.9,
      ema10: 336.78,
      ema20: 343.55,
      sma50: 358.45,
      rsi14: 40,
      // A low parent score alone is not proof that the parent-pressure path
      // passed; the typed classifier reason remains authoritative.
      higherLayerIndex: 40,
    };
    const detail = buildWeatherNarrative({
      conditionId: "headwind",
      layer: "stock",
      label: "GOOG",
      coverage: "complete",
      facts,
      conditionReason: "local-headwind",
    });
    const summary = buildWeatherSummary({
      conditionId: "headwind",
      layer: "stock",
      label: "GOOG",
      coverage: "complete",
      facts,
      conditionReason: "local-headwind",
    });
    expect(detail).toMatch(/^GOOG's own technical conditions are facing pressure\./);
    expect(summary).toMatch(/^GOOG's own technical conditions are facing pressure\./);
    expect(detail).not.toContain("Communication Services is adding pressure");
    expect(detail).not.toContain("surrounding market backdrop is weak");
    expect(summary).not.toContain("surrounding market backdrop is weak");
    expect(detail).not.toMatch(/asset|layer|surrounding environment/i);
    expect(summary).not.toMatch(/asset|layer|surrounding environment/i);
  });

  it("names the broader market only for a parent-driven Sector Headwind", () => {
    expect(
      buildWeatherSummary({
        conditionId: "headwind",
        layer: "sector",
        label: "Technology",
        coverage: "complete",
        facts: { price: 100, ema20: 105 },
        conditionReason: "weak-parent-headwind",
      }),
    ).toMatch(
      /^Technology's signals are soft while the broader market is also under pressure\./,
    );
  });

  it("describes combined local and Sector pressure without implying either alone", () => {
    const copy = buildWeatherSummary({
      conditionId: "headwind",
      layer: "stock",
      label: "GOOG",
      coverage: "complete",
      facts: {
        parentLabel: "Communication Services",
        price: 100,
        ema20: 105,
      },
      conditionReason: "local-and-parent-headwind",
    });
    expect(copy).toMatch(
      /^GOOG's technical conditions are weak, and Communication Services is adding pressure\./,
    );
  });

  it("names a Sector directly in forecasts, summaries, and relative-strength details", () => {
    const facts: WeatherNarrativeFacts = {
      price: 109.52,
      ema20: 109.53,
      rsVsSpy20d: 4.5,
      rsi14: 47,
    };
    expect(
      buildWeatherNarrative({
        conditionId: "chop-seas",
        layer: "sector",
        label: "Communication Services",
        coverage: "complete",
        facts,
      }),
    ).toMatch(/^Communication Services is mixed/);
    expect(
      buildWeatherSummary({
        conditionId: "chop-seas",
        layer: "sector",
        label: "Communication Services",
        coverage: "complete",
        facts,
      }),
    ).toMatch(/^Communication Services has mixed signals/);
    const points = buildWeatherDataPoints({
      layer: "sector",
      label: "Communication Services",
      facts,
    });
    expect(
      points.find((point) => point.label === "20-day RS vs S&P 500")?.detail,
    ).toBe(
      "Over 20 sessions, Communication Services has outperformed the S&P 500 by 4.5%.",
    );
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

  it("reports both approved Market long-term benchmarks with their exact average types", () => {
    expect(
      buildLongTermTrend({
        layer: "market",
        label: "Market",
        coverage: "complete",
        facts: {
          price: 729.54,
          sma200: 699.52,
          qqqPrice: 661.63,
          qqqEma200: 651.73,
        },
      }),
    ).toBe(
      "The S&P 500 is 4.3% above its 200-day SMA. The Nasdaq 100 is 1.5% above its 200-day EMA.",
    );
  });

  it("adds short-term contrast only when both short EMAs support it", () => {
    expect(
      buildLongTermTrend({
        layer: "stock",
        label: "GOOG",
        coverage: "complete",
        facts: {
          price: 335.9,
          sma200: 324.39,
          ema10: 336.78,
          ema20: 343.55,
        },
      }),
    ).toBe(
      "GOOG is 3.5% above its 200-day SMA despite short-term weakness.",
    );
  });

  it("hides missing trend evidence except for the explicit unmapped Industry state", () => {
    expect(
      buildLongTermTrend({
        layer: "stock",
        label: "NEW",
        coverage: "partial",
        facts: { price: 10 },
      }),
    ).toBeNull();
    expect(
      buildLongTermTrend({
        layer: "industry",
        label: "Interactive Media & Services",
        coverage: "insufficient",
        facts: {},
      }),
    ).toBe(
      "A reliable long-term trend is not available for this industry.",
    );
  });

  it("projects only available completed-cycle facts into Advanced Details chips", () => {
    const points = buildWeatherDataPoints({
      layer: "market",
      label: "Market",
      facts: {
        price: 620,
        ema20: 600,
        rsi14: 61.2,
        sectorSpdrAboveSma50: 8 / 11,
        sectorSpdrAboveSma50FreshCount: 11,
        qqqPrice: 515,
        qqqEma200: 500,
      },
    });
    expect(points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Price", value: "$620.00" }),
        expect.objectContaining({ label: "20-day EMA", value: "$600.00" }),
        expect.objectContaining({ label: "RSI (14)", value: "61.2" }),
        expect.objectContaining({
          label: "Sectors above 50-day SMA",
          value: "8/11",
        }),
        expect.objectContaining({
          label: "Nasdaq-100 200-day EMA",
          value: "$500.00",
        }),
      ]),
    );
    expect(points.some((point) => point.label === "VIX")).toBe(false);
  });

  it("explains each moving average relative to the completed-cycle price", () => {
    const points = buildWeatherDataPoints({
      layer: "stock",
      label: "GOOG",
      facts: {
        price: 100,
        ema10: 105,
        sma200: 80,
      },
    });
    expect(points.find((point) => point.label === "10-day EMA")?.detail).toContain(
      "Price is 4.8% below this level",
    );
    expect(
      points.find((point) => point.label === "200-day SMA")?.detail,
    ).toContain("Price is 25.0% above this level");
  });

  it("adds investor context to momentum, participation, and volatility facts", () => {
    const points = buildWeatherDataPoints({
      layer: "market",
      label: "Market",
      facts: {
        rsi14: 28,
        vix: 27,
        sectorSpdrAboveSma50: 3 / 11,
        sectorSpdrAboveSma50FreshCount: 11,
      },
    });
    expect(points.find((point) => point.label === "RSI (14)")?.detail).toContain(
      "oversold",
    );
    expect(points.find((point) => point.label === "VIX")?.detail).toContain(
      "elevated",
    );
    expect(
      points.find((point) => point.label === "Sectors above 50-day SMA")?.detail,
    ).toContain("narrow intermediate participation");
  });
});
