import { describe, expect, it } from "vitest";
import type { PortfolioTransaction } from "../../types";
import { isScorablePortfolioTransaction } from "./portfolioTransactions";

function imported(
  reconstructionStatus?: PortfolioTransaction["reconstructionStatus"],
): PortfolioTransaction {
  return {
    id: "import-1:row:1",
    kind: "cash",
    portfolioId: "portfolio-1",
    cashBefore: 0,
    cashAfter: 100,
    deltaCash: 100,
    filledAt: "2026-08-01T12:00:00.000Z",
    source: "import",
    reconstructionStatus,
  };
}

describe("portfolio transaction scoring boundary", () => {
  it("admits only successfully reconstructed imported history", () => {
    expect(isScorablePortfolioTransaction(imported())).toBe(false);
    expect(isScorablePortfolioTransaction(imported("pending"))).toBe(false);
    expect(isScorablePortfolioTransaction(imported("incomplete"))).toBe(false);
    expect(isScorablePortfolioTransaction(imported("unscored"))).toBe(false);
    expect(isScorablePortfolioTransaction(imported("skipped"))).toBe(false);
    expect(isScorablePortfolioTransaction(imported("scored"))).toBe(true);
  });

  it("pauses a backdated manual row while reconstruction is pending", () => {
    expect(
      isScorablePortfolioTransaction({
        ...imported("pending"),
        source: "mock",
      }),
    ).toBe(false);
  });
});
