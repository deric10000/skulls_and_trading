import { describe, expect, it } from "vitest";
import {
  computeConvictionChange,
  portfolioConvictionSeries,
} from "./convictionChange";

describe("computeConvictionChange", () => {
  it("does not invent a today delta from live drift vs a single older mark", () => {
    expect(
      computeConvictionChange(86, [{ asOf: "2026-07-21", conviction: 93 }], "2026-07-22"),
    ).toEqual({ todayDelta: null, sessions5Delta: null });
  });

  it("shows today delta only after a same-day stamped mark vs prior session", () => {
    expect(
      computeConvictionChange(
        86,
        [
          { asOf: "2026-07-21", conviction: 93 },
          { asOf: "2026-07-22", conviction: 86 },
        ],
        "2026-07-22",
      ),
    ).toEqual({ todayDelta: -7, sessions5Delta: null });
  });

  it("computes the 5-session delta when enough prior marks exist", () => {
    const series = [1, 2, 3, 4, 5, 6].map((d) => ({
      asOf: `2026-07-${String(d).padStart(2, "0")}`,
      conviction: 80 + d,
    }));
    // today = 07/06 mark; five sessions back among prior = 07/01 (80+1=81)
    expect(computeConvictionChange(90, series, "2026-07-06")).toEqual({
      todayDelta: 90 - 85, // prior last = 07/05 → 85
      sessions5Delta: 90 - 81, // prior[0] when length>=5 → 07/01
    });
  });
});

describe("portfolioConvictionSeries", () => {
  it("skips exact-zero stale marks", () => {
    expect(
      portfolioConvictionSeries([
        {
          asOf: "2026-07-22",
          openPnlPct: 1,
          metrics: { conviction: 0 },
        },
      ] as unknown as Parameters<typeof portfolioConvictionSeries>[0]),
    ).toEqual([]);
  });
});
