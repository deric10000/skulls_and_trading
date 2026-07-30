import { describe, expect, it } from "vitest";
import type { TechnicalSnapshot } from "../../types";
import type { WeatherSymbolObservable } from "../market/client";
import { buildStockV2Reading } from "./stockV2Adapter";

const technicals = {
  rsi14: 58, relativeVolume: 1.4, priceVs10EmaPct: 3,
  priceVs20EmaPct: 2, atrPct14d: 2, asOf: "2026-07-29", source: "live",
  priceAbove200dSma: 1, priceAbove50dSma: 1, priceAbove20dSma: 1,
  weeklyRsi: null, drawdownFrom52wHighPct: 3, priceChange3mPct: null,
  priceVsVwapPct: null, priceVs50EmaPct: null, daysUntilEarnings: null,
  beta1y: null, avgDollarVolume20d: null, sectorEtf1mChangePct: null,
} satisfies TechnicalSnapshot;

const observable: WeatherSymbolObservable = {
  asOf: "2026-07-29T20:00:00.000Z", price: 100, atrPct: 2,
  atrPctBaseline60d: 2.2, drawdownFrom20dHighPct: 2, rsi14: 58,
  return5dPct: 2, return20dPct: 6, rsVsSpy5d: 1, rsVsSpy20d: 2,
  rsVsSector5d: 0.5, rsVsSector20d: 1,
};

describe("Stock V2 adapter", () => {
  it("builds Structure, published RS, and volume Participation", () => {
    const reading = buildStockV2Reading({
      ticker: "aapl", price: 100, technicals, observable, sectorWeatherIndex: 60,
    });
    expect(reading.ticker).toBe("AAPL");
    expect(reading.coverage).not.toBe("insufficient");
    expect(reading.pillars.structure).toBeTypeOf("number");
    expect(reading.pillars.relativeStrength).toBeTypeOf("number");
    expect(reading.pillars.participation).toBe(60);
  });

  it("is insufficient without the Structure floor", () => {
    const reading = buildStockV2Reading({
      ticker: "AAPL", price: 100,
      technicals: { ...technicals, priceVs20EmaPct: null, priceVs10EmaPct: null },
      observable,
    });
    expect(reading.condition.kind).toBe("insufficient");
  });

  it("omits unpublished RS instead of fabricating it", () => {
    const reading = buildStockV2Reading({
      ticker: "AAPL", price: 100, technicals,
      observable: {
        ...observable, rsVsSpy5d: undefined, rsVsSpy20d: undefined,
        rsVsSector5d: undefined, rsVsSector20d: undefined,
      },
    });
    expect(reading.coverage).toBe("partial");
    expect(reading.pillars.relativeStrength).toBeUndefined();
  });

  it("marks an explicitly stale symbol observable partial", () => {
    const reading = buildStockV2Reading({
      ticker: "AAPL",
      price: 100,
      technicals,
      observable: { ...observable, freshness: "stale" },
    });
    expect(reading.coverage).toBe("partial");
  });

  it("takes the G6 weak-Sector headwind path", () => {
    const reading = buildStockV2Reading({
      ticker: "G6", price: 100,
      technicals: {
        ...technicals, rsi14: 56, relativeVolume: 0.92,
        priceVs10EmaPct: 0, priceVs20EmaPct: 0,
      },
      observable: {
        ...observable, atrPctBaseline60d: 1.8,
        drawdownFrom20dHighPct: 4.5, rsi14: 56, return5dPct: 0,
        rsVsSpy5d: -1 / 3, rsVsSpy20d: -0.5,
        rsVsSector5d: -1 / 3, rsVsSector20d: -0.5,
      },
      sectorWeatherIndex: 30,
    });
    expect(reading.condition).toMatchObject({
      kind: "condition", conditionId: "headwind",
    });
  });
});
