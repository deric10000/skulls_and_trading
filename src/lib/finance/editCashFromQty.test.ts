import { describe, expect, it } from "vitest";
import {
  qtyCashImpact,
  roundMoney,
  simulatedEditCash,
} from "./editCashFromQty";

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
});
