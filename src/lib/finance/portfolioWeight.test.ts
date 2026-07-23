import { describe, expect, it } from "vitest";
import { portfolioWeightPct } from "./portfolioWeight";

describe("portfolioWeightPct", () => {
  const priceOf = (ticker: string) =>
    ticker === "NOW" ? 99.9 : ticker === "AAPL" ? 200 : 0;

  it("returns share of marked book", () => {
    const holdings = [
      { ticker: "NOW", shares: 96 },
      { ticker: "AAPL", shares: 10 },
    ];
    // NOW MV 9590.4 / (9590.4 + 2000) ≈ 82.75%
    expect(portfolioWeightPct(holdings, "NOW", priceOf)).toBeCloseTo(
      (96 * 99.9 * 100) / (96 * 99.9 + 10 * 200),
      5,
    );
  });

  it("returns undefined when the name has no usable mark (never fake 0%)", () => {
    expect(
      portfolioWeightPct(
        [
          { ticker: "NOW", shares: 96 },
          { ticker: "AAPL", shares: 10 },
        ],
        "NOW",
        (t) => (t === "AAPL" ? 200 : 0),
      ),
    ).toBeUndefined();
  });

  it("ignores unpriced peers in the book denominator", () => {
    expect(
      portfolioWeightPct(
        [
          { ticker: "NOW", shares: 96 },
          { ticker: "ZED", shares: 1000 },
        ],
        "NOW",
        priceOf,
      ),
    ).toBe(100);
  });
});
