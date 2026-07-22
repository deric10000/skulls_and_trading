import { describe, expect, it } from "vitest";
import type { RuleChip } from "../../types";
import { formatObservedBreach } from "./metrics";

function chip(
  metric: RuleChip["metric"],
  operator: RuleChip["operator"],
  value: RuleChip["value"],
): RuleChip {
  return {
    id: "t",
    label: metric,
    category: "trade",
    metric,
    operator,
    value,
    weightPct: 10,
    dateRange: "Current",
    enabled: true,
  };
}

describe("formatObservedBreach — universal My Plan language", () => {
  it("formats negative percent floors without stacking below/or more", () => {
    const text = formatObservedBreach(
      chip("openPnlPct", ">=", -15),
      -39.25,
    );
    expect(text).toBe(
      "Open P&L % is -39.25%. Your plan needs -15.00% or better — you are 24.25 percentage points short.",
    );
  });

  it("formats positive percent floors", () => {
    const text = formatObservedBreach(
      chip("revenueGrowthPct", ">=", 25),
      10,
    );
    expect(text).toBe(
      "Revenue Growth YoY is 10.00%. Your plan needs 25.00% or better — you are 15.00 percentage points short.",
    );
  });

  it("formats percent ceilings", () => {
    const text = formatObservedBreach(chip("rsi", "<", 75), 82);
    expect(text).toBe(
      "RSI (14) is 82.00. Your plan needs below 75.00 — you are 7.00 over.",
    );
  });

  it("formats ratio ceilings", () => {
    const text = formatObservedBreach(
      chip("interestCoverage", ">=", 5),
      2.5,
    );
    expect(text).toBe(
      "Interest Coverage Ratio is 2.50x. Your plan needs 5.00x or better — you are 2.50x short.",
    );
  });

  it("formats currency floors", () => {
    const text = formatObservedBreach(
      chip("operatingCashFlow", ">", 0),
      -0.4,
    );
    expect(text).toBe(
      "Operating Cash Flow is $-0.40B. Your plan needs greater than $0.00B — you are $0.40B short.",
    );
  });

  it("formats boolean TRUE requirement in plain English", () => {
    const text = formatObservedBreach(chip("spyAbove200dSma", "is", 1), 0);
    expect(text).toContain("SPY Above 200D SMA is FALSE");
    expect(text).toContain("Your plan needs this to hold");
    expect(text).not.toMatch(/requires TRUE/i);
  });

  it("formats boolean FALSE requirement in plain English", () => {
    const text = formatObservedBreach(chip("spyAbove200dSma", "is", 0), 1);
    expect(text).toContain("SPY Above 200D SMA is TRUE");
    expect(text).toContain("Your plan needs this not to hold");
  });

  it("formats between bands outside low", () => {
    const text = formatObservedBreach(chip("rsi", "between", [30, 70]), 20);
    expect(text).toBe(
      "RSI (14) is 20.00. Your plan needs 30.00–70.00 — you are 10.00 below that band.",
    );
  });

  it("formats between bands outside high", () => {
    const text = formatObservedBreach(chip("rsi", "between", [30, 70]), 85);
    expect(text).toBe(
      "RSI (14) is 85.00. Your plan needs 30.00–70.00 — you are 15.00 above that band.",
    );
  });

  it("formats null as em dash", () => {
    expect(formatObservedBreach(chip("netMarginPct", ">=", 0), null)).toBe(
      "Net Margin = —",
    );
  });

  it("formats <= ceilings", () => {
    const text = formatObservedBreach(chip("weightPct", "<=", 15), 18.5);
    expect(text).toBe(
      "Position Weight is 18.50%. Your plan needs 15.00% or lower — you are 3.50 percentage points over.",
    );
  });
});
