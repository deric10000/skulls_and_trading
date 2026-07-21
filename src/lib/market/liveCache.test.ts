import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearStrategyConvictionDirty,
  getLastDataPullAt,
  getLiveQuote,
  isConvictionScoreReady,
  markStrategyConvictionDirty,
  resetLiveCache,
  setLastDataPullAt,
  setLiveQuotes,
} from "./liveCache";

afterEach(() => {
  resetLiveCache();
  vi.useRealTimers();
});

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
});
