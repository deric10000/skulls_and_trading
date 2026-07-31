import { afterEach, describe, expect, it } from "vitest";
import type { MarketCyclePayload } from "../market/client";
import {
  applyMarketCycle,
  resetLiveCache,
  setLiveQuotes,
} from "../market/liveCache";
import { addLiveV2Stocks } from "./liveV2";
import { getMarketWeatherSnapshot } from "./mock";

afterEach(() => resetLiveCache());

function cycle(
  overrides: Partial<MarketCyclePayload> = {},
): MarketCyclePayload {
  return {
    cycleAsOf: "2026-07-31T13:00:00.000Z",
    completedAt: "2026-07-31T13:05:00.000Z",
    publishedAt: "2026-07-31T13:05:00.000Z",
    nextCycleAt: "2026-07-31T14:00:00.000Z",
    symbols: [],
    quotes: {},
    fundamentals: {},
    technicals: {},
    byTimeframe: {},
    context: null,
    errors: [],
    ...overrides,
  };
}

describe("Stock Weather provenance", () => {
  it("does not label a quote-only fallback as a completed market close", () => {
    setLiveQuotes({
      TEST: {
        ticker: "TEST",
        lastPrice: 100,
        asOf: "2026-07-31T13:00:00.000Z",
        source: "live",
      },
    });

    const result = addLiveV2Stocks(getMarketWeatherSnapshot("live"), [
      { ticker: "TEST" },
    ]);

    expect(result.stocks.TEST.dataAsOf).toBeUndefined();
  });

  it("uses the completed-daily Weather observable as the close-date authority", () => {
    applyMarketCycle(cycle({
      symbols: ["TEST"],
      quotes: {
        TEST: {
          ticker: "TEST",
          lastPrice: 101,
          asOf: "2026-07-31T13:00:00.000Z",
          source: "live",
        },
      },
      weatherSymbolObservables: {
        TEST: {
          asOf: "2026-07-30T20:00:00.000Z",
          price: 100,
        },
      },
    }));

    const result = addLiveV2Stocks(getMarketWeatherSnapshot("live"), [
      { ticker: "TEST" },
    ]);

    expect(result.stocks.TEST.dataAsOf).toBe("2026-07-30");
  });
});
