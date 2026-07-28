import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWeatherTaxonomyReadiness,
  resetLiveCache,
  setProviderBudgets,
} from "../market/liveCache";
import {
  enqueueWeatherTaxonomyHydrate,
  ensureWeatherTaxonomyAwaiting,
} from "./hydrateTaxonomy";

vi.mock("../market/client", () => ({
  fetchMarketFundamentals: vi.fn(async (symbol: string) => ({
    fundamentals: {
      revenueGrowthPct: null,
      epsGrowthPct: null,
      grossMarginPct: null,
      operatingMarginPct: null,
      netMarginPct: null,
      fcfMarginPct: null,
      returnOnEquityPct: null,
      operatingCashFlow: null,
      netIncome: null,
      epsTtm: null,
      peRatio: null,
      forwardPE: null,
      priceToSales: null,
      evToEbitda: null,
      debtToEquity: null,
      interestCoverage: null,
      currentRatio: null,
      dividendYieldPct: null,
      payoutRatioPct: null,
      dividendGrowth5yPct: null,
      buybackYieldPct: null,
      providerSector: symbol === "GOOG" ? "Technology" : null,
      providerIndustry: symbol === "GOOG" ? "Software—Application" : null,
      asOf: "2026-07-28",
      source: "live" as const,
    },
    budgets: [
      { id: "yahoo" as const, remaining: 25, limit: 30, resetAt: Date.now() + 60_000 },
    ],
  })),
}));

afterEach(() => {
  resetLiveCache();
  vi.useRealTimers();
});

describe("hydrateTaxonomy", () => {
  it("hydrates taxonomy without waiting on Forge paths", async () => {
    setProviderBudgets([
      { id: "yahoo", remaining: 25, limit: 30, resetAt: Date.now() + 60_000 },
    ]);
    enqueueWeatherTaxonomyHydrate(["GOOG"]);
    expect(getWeatherTaxonomyReadiness("GOOG")?.status).toBe("pending");

    await vi.waitFor(() => {
      expect(getWeatherTaxonomyReadiness("GOOG")?.status).toBe("ready");
    });
  });

  it("marks awaiting names pending with a non-null countdown ETA", async () => {
    ensureWeatherTaxonomyAwaiting(["UNKNOWNXYZ"]);
    expect(getWeatherTaxonomyReadiness("UNKNOWNXYZ")?.status).toBe("pending");
    expect(getWeatherTaxonomyReadiness("UNKNOWNXYZ")?.etaAt).toBeTruthy();
  });
});
