import { describe, expect, it } from "vitest";
import type { Portfolio } from "../../types";
import type { PortfolioAlignment } from "./alignment";
import { computeHelmMetrics } from "./helmMetrics";

describe("computeHelmMetrics", () => {
  it("keeps untracked holdings only in Strategy Coverage denominator", () => {
    const portfolio = {
      id: "book",
      type: "portfolio",
      label: "Book",
      holdings: [
        {
          ticker: "TRACK",
          shares: 2,
          avgPrice: 10,
          strategyIds: ["strategy"],
        },
        {
          ticker: "LOOSE",
          shares: 10,
          avgPrice: 100,
          strategyIds: [],
        },
      ],
    } as Portfolio;
    const alignment = {
      byTicker: {
        TRACK: {
          bucketName: "Strategy",
          status: "Aligned",
        },
      },
      portfolio: { conviction: 80 },
    } as unknown as PortfolioAlignment;

    const metrics = computeHelmMetrics({
      portfolio,
      alignment,
      priceOf: (ticker) => (ticker === "TRACK" ? 15 : 50),
      isTracked: (ticker) => ticker === "TRACK",
      isScoreReady: () => true,
    });

    expect(metrics.holdingCount).toBe(2);
    expect(metrics.scoredCount).toBe(1);
    expect(metrics.coveragePct).toBe(50);
    expect(metrics.openPnlPct).toBe(50);
    expect(metrics.statusMix).toEqual([{ tone: "positive", count: 1 }]);
    expect(metrics.composition).toEqual([{ label: "Strategy", count: 1 }]);
  });
});
