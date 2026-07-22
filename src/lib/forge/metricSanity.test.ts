import { describe, expect, it } from "vitest";
import type { FundamentalSnapshot } from "../../types";
import { sanitizeFundamentals } from "./metricSanity";

function base(overrides: Partial<FundamentalSnapshot> = {}): FundamentalSnapshot {
  return {
    revenueGrowthPct: 10,
    epsGrowthPct: 10,
    grossMarginPct: 40,
    operatingMarginPct: 10,
    netMarginPct: 8,
    fcfMarginPct: 5,
    returnOnEquityPct: 15,
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
    asOf: "2026-07-22",
    source: "live",
    ...overrides,
  };
}

describe("sanitizeFundamentals", () => {
  it("quarantines pathological P/S (ACHR-scale fixture)", () => {
    const next = sanitizeFundamentals(base({ priceToSales: 2120 }));
    expect(next.priceToSales).toBeNull();
  });

  it("quarantines net vs operating margin contradictions when both pass bounds", () => {
    const next = sanitizeFundamentals(
      base({ netMarginPct: 60, operatingMarginPct: -80 }),
    );
    expect(next.netMarginPct).toBeNull();
    expect(next.operatingMarginPct).toBeNull();
  });

  it("quarantines extreme IONQ-scale margin contradictions via raw cross-field", () => {
    const next = sanitizeFundamentals(
      base({ netMarginPct: 174.9, operatingMarginPct: -402 }),
    );
    expect(next.netMarginPct).toBeNull();
    expect(next.operatingMarginPct).toBeNull();
  });

  it("keeps sane fundies intact", () => {
    const snap = base();
    expect(sanitizeFundamentals(snap)).toEqual(snap);
  });

  it("nulls non-finite ratios", () => {
    const next = sanitizeFundamentals(
      base({ peRatio: Number.NaN, debtToEquity: Number.POSITIVE_INFINITY }),
    );
    expect(next.peRatio).toBeNull();
    expect(next.debtToEquity).toBeNull();
  });
});
