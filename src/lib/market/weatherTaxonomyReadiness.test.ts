import { afterEach, describe, expect, it } from "vitest";
import {
  getLiveCacheRevision,
  getLiveFundamentals,
  getLiveTaxonomy,
  getWeatherTaxonomyReadiness,
  markWeatherTaxonomyPending,
  resetLiveCache,
  resolveWeatherTaxonomyEtaAt,
  setLiveFundamentals,
  setLiveTaxonomyFromFundamentals,
  synthesizeNextCycleEtaAt,
} from "./liveCache";

afterEach(() => {
  resetLiveCache();
});

describe("weather taxonomy readiness", () => {
  it("taxonomy-only ingest bumps taxonomy, not scoreInputs", () => {
    const scoreBefore = getLiveCacheRevision("scoreInputs");
    const taxBefore = getLiveCacheRevision("taxonomy");
    markWeatherTaxonomyPending("GOOG", "2026-07-28T16:00:00.000Z");

    setLiveTaxonomyFromFundamentals("GOOG", {
      providerSector: "Technology",
      providerIndustry: "Software—Application",
    });

    expect(getLiveCacheRevision("scoreInputs")).toBe(scoreBefore);
    expect(getLiveCacheRevision("taxonomy")).toBeGreaterThan(taxBefore);
    expect(getLiveFundamentals("GOOG")).toBeUndefined();
    expect(getLiveTaxonomy("GOOG")?.sector).toBe("Information Technology");
    expect(getLiveTaxonomy("GOOG")?.industry).toBe("Software");
    expect(getWeatherTaxonomyReadiness("GOOG")?.status).toBe("ready");
  });

  it("marks failed on incomplete mapping after pending hydrate", () => {
    markWeatherTaxonomyPending("ZZZZ", null);
    setLiveTaxonomyFromFundamentals("ZZZZ", {
      providerSector: null,
      providerIndustry: null,
    });
    expect(getWeatherTaxonomyReadiness("ZZZZ")?.status).toBe("failed");
    expect(getWeatherTaxonomyReadiness("ZZZZ")?.reason).toBe("missing_provider");
  });

  it("always resolves a countdown clock while pending — even with null stored etaAt and no cycle meta", () => {
    // Mirrors conviction: Current Watch countdown is computed (cadence), not
    // optional. Weather pending must never blank the mm:ss.
    const now = Date.parse("2026-07-28T16:30:00.000Z");
    markWeatherTaxonomyPending("GOOG", null);
    const eta = resolveWeatherTaxonomyEtaAt("GOOG", now);
    expect(eta).toBe(synthesizeNextCycleEtaAt(now));
    expect(Date.parse(eta!)).toBeGreaterThan(now);
  });

  it("setLiveFundamentals still bumps scoreInputs for Forge paths", () => {
    const scoreBefore = getLiveCacheRevision("scoreInputs");
    setLiveFundamentals("AAPL", {
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
      providerSector: "Technology",
      providerIndustry: "Consumer Electronics",
      asOf: "2026-07-21",
      source: "live",
    });
    expect(getLiveCacheRevision("scoreInputs")).toBeGreaterThan(scoreBefore);
    expect(getLiveFundamentals("AAPL")).toBeTruthy();
  });
});
