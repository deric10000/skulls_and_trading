import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMarketCycle,
  clearStrategyConvictionDirty,
  getLastDataPullAt,
  getLiveQuote,
  hasUsableLiveQuote,
  isConvictionScoreReady,
  markStrategyConvictionDirty,
  resetLiveCache,
  setLastDataPullAt,
  setLiveQuotes,
} from "./liveCache";
import type { MarketCyclePayload } from "./client";
import type { MarketContext } from "../../types";

afterEach(() => {
  resetLiveCache();
  vi.useRealTimers();
});

const EMPTY_CONTEXT: MarketContext = {
  vix: 17,
  spyRsi: 50,
  spyAbove200dSma: 1,
  spy5dChangePct: -0.5,
  highYieldSpreadPct: 3,
  treasury10y5dChangePct: 0,
  asOf: "2026-07-21",
  source: "live",
};

function emptyCycle(
  overrides: Partial<MarketCyclePayload> = {},
): MarketCyclePayload {
  return {
    cycleAsOf: "2026-07-21T20:00:00.000Z",
    completedAt: "2026-07-21T20:05:00.000Z",
    publishedAt: "2026-07-21T20:05:00.000Z",
    nextCycleAt: "2026-07-21T21:00:00.000Z",
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

describe("account market-state hydration", () => {
  it("restores a real quote and strategy check stamp", () => {
    setLiveQuotes({
      AAPL: {
        ticker: "AAPL",
        lastPrice: 225,
        asOf: "2026-07-21T20:00:00.000Z",
        source: "live",
      },
    });
    setLastDataPullAt("strategy", "2026-07-21T20:00:00.000Z");

    expect(getLiveQuote("aapl")?.lastPrice).toBe(225);
    expect(getLastDataPullAt("strategy")).toBe(
      "2026-07-21T20:00:00.000Z",
    );
    expect(isConvictionScoreReady("book", "AAPL", ["strategy"])).toBe(true);
  });

  it("keeps an edited strategy pending until a real scoped check clears it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T21:00:00.000Z"));
    setLastDataPullAt("strategy", "2026-07-21T20:00:00.000Z");
    markStrategyConvictionDirty("strategy");

    expect(isConvictionScoreReady("book", "AAPL", ["strategy"])).toBe(false);
    clearStrategyConvictionDirty("strategy");
    expect(isConvictionScoreReady("book", "AAPL", ["strategy"])).toBe(true);
  });

  it("clears account marks and stamps on account switch", () => {
    setLiveQuotes({
      AAPL: {
        ticker: "AAPL",
        lastPrice: 225,
        asOf: "2026-07-21T20:00:00.000Z",
        source: "live",
      },
    });
    setLastDataPullAt("strategy", "2026-07-21T20:00:00.000Z");
    resetLiveCache();

    expect(getLiveQuote("AAPL")).toBeUndefined();
    expect(getLastDataPullAt("strategy")).toBeUndefined();
  });

  it("keeps Score Pending when a published cycle lacks context or fundies", () => {
    setLastDataPullAt("strategy", "2026-07-21T20:00:00.000Z");
    applyMarketCycle(
      emptyCycle({
        quotes: {
          AAPL: {
            ticker: "AAPL",
            lastPrice: 225,
            asOf: "2026-07-21T20:00:00.000Z",
            source: "live",
          },
        },
        context: null,
        fundamentals: {},
      }),
    );

    expect(isConvictionScoreReady("book", "AAPL", ["strategy"])).toBe(false);
  });

  it("is ready when cycle includes context and ticker fundamentals", () => {
    setLastDataPullAt("strategy", "2026-07-21T20:00:00.000Z");
    applyMarketCycle(
      emptyCycle({
        quotes: {
          AAPL: {
            ticker: "AAPL",
            lastPrice: 225,
            asOf: "2026-07-21T20:00:00.000Z",
            source: "live",
          },
        },
        context: EMPTY_CONTEXT,
        fundamentals: {
          AAPL: {
            revenueGrowthPct: 10,
            epsGrowthPct: 10,
            grossMarginPct: 40,
            operatingMarginPct: 20,
            netMarginPct: 15,
            fcfMarginPct: 10,
            returnOnEquityPct: 20,
            operatingCashFlow: 1,
            netIncome: 1,
            epsTtm: 1,
            peRatio: 20,
            forwardPE: 18,
            priceToSales: 5,
            evToEbitda: 12,
            debtToEquity: 0.5,
            interestCoverage: null,
            currentRatio: 1.5,
            dividendYieldPct: 1,
            payoutRatioPct: 30,
            dividendGrowth5yPct: null,
            buybackYieldPct: null,
            asOf: "2026-07-21",
            source: "live",
          },
        },
      }),
    );

    expect(isConvictionScoreReady("book", "AAPL", ["strategy"])).toBe(true);
  });
});

describe("hasUsableLiveQuote", () => {
  it("rejects missing and zero lastPrice marks", () => {
    expect(hasUsableLiveQuote("MISSING")).toBe(false);
    setLiveQuotes({
      ZED: {
        ticker: "ZED",
        lastPrice: 0,
        asOf: "2026-07-22T20:00:00.000Z",
        source: "live",
      },
    });
    expect(hasUsableLiveQuote("ZED")).toBe(false);
    setLiveQuotes({
      ZED: {
        ticker: "ZED",
        lastPrice: 12.5,
        asOf: "2026-07-22T20:00:00.000Z",
        source: "live",
      },
    });
    expect(hasUsableLiveQuote("ZED")).toBe(true);
  });
});
