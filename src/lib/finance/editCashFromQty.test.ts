import { describe, expect, it } from "vitest";
import {
  qtyCashImpact,
  roundMoney,
  simulatedEditCash,
} from "./editCashFromQty";
import { portfolioRunningTotals } from "./portfolioTotals";

describe("editCashFromQty", () => {
  const priceOf = (ticker: string) => (ticker === "SOFI" ? 17.63 : 0);

  it("spends cash on simulated buys and frees cash on sells", () => {
    expect(
      qtyCashImpact({ SOFI: 403 }, { SOFI: 404 }, priceOf),
    ).toBe(roundMoney(-17.63));
    expect(
      qtyCashImpact({ SOFI: 403 }, { SOFI: 402 }, priceOf),
    ).toBe(roundMoney(17.63));
  });

  it("ignores tickers with no last price for cash impact", () => {
    expect(qtyCashImpact({ MSFT: 10 }, { MSFT: 12 }, priceOf)).toBe(0);
  });

  it("combines baseline, qty impact, and manual offset", () => {
    expect(simulatedEditCash(100, -17.63, 50)).toBe(roundMoney(132.37));
    expect(simulatedEditCash(10, -50, 0)).toBe(0);
  });

  it("keeps Total flat when qty reallocates using draft shares + cashDraft", () => {
    const baseline = { SOFI: 100 };
    const drafts = { SOFI: 90 };
    const cashBaseline = 500;
    const mark = 17.63;
    const impact = qtyCashImpact(baseline, drafts, priceOf);
    const cashDraft = simulatedEditCash(cashBaseline, impact, 0);

    const before = portfolioRunningTotals(
      [{ price: mark, shares: baseline.SOFI, avgPrice: 10 }],
      cashBaseline,
    );
    const after = portfolioRunningTotals(
      [{ price: mark, shares: drafts.SOFI, avgPrice: 10 }],
      cashDraft,
    );

    expect(after.totalValue).toBeCloseTo(before.totalValue, 2);
    expect(after.cashAvailable).toBeGreaterThan(before.cashAvailable);
    expect(after.holdingsMarketValue).toBeLessThan(before.holdingsMarketValue);
  });

  it("changes Total when cashOffset is edited without qty change", () => {
    const positions = [{ price: 17.63, shares: 100, avgPrice: 10 }];
    const cashBaseline = 500;
    const before = portfolioRunningTotals(positions, cashBaseline);
    const after = portfolioRunningTotals(
      positions,
      simulatedEditCash(cashBaseline, 0, 100),
    );
    expect(after.totalValue).toBeCloseTo(before.totalValue + 100, 2);
  });
});
