import { describe, expect, it } from "vitest";
import type { WeatherBenchmarksPayload } from "../market/client";
import { buildIndustryV2Reading } from "./industryV2Adapter";

const weather: WeatherBenchmarksPayload = {
  status: "complete",
  expectedSymbols: ["SOXX"],
  freshSymbols: ["SOXX"],
  missingSymbols: [],
  benchmarks: {
    SOXX: {
      asOf: "2026-07-29T20:00:00.000Z",
      price: 300,
      ema10: 295,
      ema20: 290,
      sma50: 280,
      sma200: 240,
      atrPct: 2,
      atrPctBaseline60d: 2.1,
      drawdownFrom20dHighPct: 2,
      rsi14: 65,
      return5dPct: 3,
      rsVsSpy5d: 1,
      rsVsSpy20d: 2,
    },
  },
  sectorSpdrOutperformingFreshCount: 0,
  sectorSpdrAboveSma50FreshCount: 0,
};

describe("Industry V2 adapter", () => {
  it("is honestly unavailable when no system ETF mapping is approved", () => {
    expect(buildIndustryV2Reading("Semiconductors & Semiconductor Equipment", weather))
      .toMatchObject({
        etf: null,
        coverage: "insufficient",
        condition: {
          kind: "industry-unavailable",
          reason: "independent-industry-weather-unavailable",
        },
      });
  });

  it("uses only an explicit fixed ETF mapping when one is supplied", () => {
    const reading = buildIndustryV2Reading(
      "Semiconductors & Semiconductor Equipment",
      weather,
      {
        industryEtfMap: {
          "Semiconductors & Semiconductor Equipment": "SOXX",
        },
      },
    );
    expect(reading.etf).toBe("SOXX");
    expect(reading.coverage).not.toBe("insufficient");
    expect(reading.condition.kind).toBe("condition");
  });
});
