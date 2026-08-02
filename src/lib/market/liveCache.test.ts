import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMarketCycle,
  clearStrategyConvictionDirty,
  getLastDataPullAt,
  getLiveQuote,
  getLiveWeatherSymbolObservable,
  hasUsableLiveQuote,
  isConvictionScoreReady,
  markStrategyConvictionDirty,
  resetLiveCache,
  resolveNextCycleEtaAt,
  setLastDataPullAt,
  setLiveQuotes,
  synthesizeNextCycleEtaAt,
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
  it("hydrates per-symbol Weather observables with a completed cycle", () => {
    applyMarketCycle(emptyCycle({
      weatherSymbolObservables: {
        AAPL: {
          asOf: "2026-07-21T20:00:00.000Z",
          price: 225,
          return5dPct: 2,
          rsVsSpy5d: 1,
        },
      },
    }));
    expect(getLiveWeatherSymbolObservable("aapl")).toMatchObject({
      return5dPct: 2,
      rsVsSpy5d: 1,
    });
  });

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

describe("resolveNextCycleEtaAt", () => {
  it("keeps a future published nextCycleAt", () => {
    // Friday 09:20 ET — pull window open
    const now = Date.parse("2026-07-31T13:20:00.000Z");
    expect(
      resolveNextCycleEtaAt("2026-07-31T14:00:00.000Z", now),
    ).toEqual({
      etaAt: "2026-07-31T14:00:00.000Z",
      overdue: false,
      marketClosed: false,
    });
  });

  it("marks overdue inside an open window when published nextCycleAt is past", () => {
    // Friday 09:20 ET — pull window open
    const now = Date.parse("2026-07-31T13:20:00.000Z");
    expect(
      resolveNextCycleEtaAt("2026-07-31T10:00:00.000Z", now),
    ).toEqual({
      etaAt: synthesizeNextCycleEtaAt(now),
      overdue: true,
      marketClosed: false,
    });
  });

  it("uses Sunday overnight open instead of hourly retry when closed", () => {
    // Sunday 15:00 ET — pull window closed
    const now = Date.parse("2026-08-02T19:00:00.000Z");
    expect(
      resolveNextCycleEtaAt("2026-08-01T01:00:00.000Z", now),
    ).toEqual({
      etaAt: synthesizeNextCycleEtaAt(now),
      overdue: false,
      marketClosed: true,
    });
    expect(synthesizeNextCycleEtaAt(now)).toBe("2026-08-03T00:00:00.000Z");
  });

  it("rejects a future hourly nextCycleAt that falls outside the pull window", () => {
    // Sunday 12:58 ET — closed; published next is Sunday 13:28 ET (stale +1h)
    const now = Date.parse("2026-08-02T16:58:00.000Z");
    const staleHourly = "2026-08-02T17:28:00.000Z";
    expect(
      resolveNextCycleEtaAt(staleHourly, now),
    ).toEqual({
      etaAt: "2026-08-03T00:00:00.000Z",
      overdue: false,
      marketClosed: true,
    });
  });

  it("keeps a future published nextCycleAt that lands on overnight open", () => {
    // Saturday noon ET — closed; Worker already published Sun 20:00 ET
    const now = Date.parse("2026-08-01T16:00:00.000Z");
    expect(
      resolveNextCycleEtaAt("2026-08-03T00:00:00.000Z", now),
    ).toEqual({
      etaAt: "2026-08-03T00:00:00.000Z",
      overdue: false,
      marketClosed: true,
    });
  });
});
