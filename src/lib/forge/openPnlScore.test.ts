import { describe, expect, it } from "vitest";
import { openPnlPercent } from "../finance/averageCost";

/**
 * Regression: chips must score mark×avg, not a stale stored holding %.
 * (alignment.ts / AppState wire openPnlPercent — this locks the math.)
 */
describe("openPnl score-time input", () => {
  it("prefers mark-implied P&L over a stale stored reading", () => {
    const stored = -39.25;
    const avg = 56.36;
    const mark = 35.53; // public-ish last
    const fromMark = openPnlPercent(mark, avg);
    expect(fromMark).toBeCloseTo(-36.99, 1);
    expect(fromMark).not.toBeCloseTo(stored, 1);
  });
});
