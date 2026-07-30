import { describe, expect, it } from "vitest";
import type { MarketContext } from "../../types";
import type { WeatherBenchmarksPayload } from "../market/client";
import { buildMarketV2Reading } from "./marketV2Adapter";

const context: MarketContext = {
  vix: 18,
  spyRsi: 60,
  spyAbove200dSma: 1,
  spy5dChangePct: 2,
  highYieldSpreadPct: 3.5,
  treasury10y5dChangePct: null,
  asOf: "2026-07-29",
  source: "live",
};

const complete: WeatherBenchmarksPayload = {
  status: "complete",
  completedAt: "2026-07-29T20:30:00.000Z",
  expectedSymbols: [],
  freshSymbols: [],
  missingSymbols: [],
  benchmarks: {
    SPY: {
      asOf: "2026-07-29T20:00:00.000Z",
      price: 620,
      ema10: 610,
      ema20: 600,
      sma20: 598,
      sma50: 580,
      sma200: 530,
      atrPct: 1.2,
      rsi14: 64,
      return5dPct: 2.5,
      return20dPct: 6,
    },
    QQQ: {
      asOf: "2026-07-29T20:00:00.000Z",
      price: 550,
      ema200: 500,
      atrPct: 1.5,
    },
  },
  rspMinusSpy5dPct: 1,
  iwmMinusSpy5dPct: 0.5,
  sectorSpdrOutperforming: 8 / 11,
  sectorSpdrOutperformingFreshCount: 11,
  sectorSpdrAboveSma50: 9 / 11,
  sectorSpdrAboveSma50FreshCount: 11,
};

describe("Market V2 cycle adapter", () => {
  it("builds a classified reading without changing the v1 snapshot path", () => {
    const reading = buildMarketV2Reading(context, complete);
    expect(reading.coverage).toBe("complete");
    expect(reading.weatherIndex).toBeTypeOf("number");
    expect(reading.pillars).toMatchObject({
      structure: expect.any(Number),
      participation: expect.any(Number),
      risk: expect.any(Number),
      momentum: expect.any(Number),
    });
    expect(reading.qqq200?.break).toBe(false);
    expect(reading.condition.kind).toBe("condition");
  });

  it("returns insufficient instead of manufacturing missing benchmarks", () => {
    const reading = buildMarketV2Reading(context, {
      ...complete,
      status: "insufficient",
      benchmarks: {},
      rspMinusSpy5dPct: undefined,
      iwmMinusSpy5dPct: undefined,
    });
    expect(reading.coverage).toBe("insufficient");
    expect(reading.condition).toEqual({
      kind: "insufficient",
      coverage: "insufficient",
    });
    expect(reading.weatherIndex).not.toBe(50);
  });
});
