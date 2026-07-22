import { describe, expect, it } from "vitest";
import {
  clipSparkPointsThrough,
  displaySparkPointsForRange,
  etIsoDate,
  latestEtDay,
  seriesToConvictionSparkPoints,
  sparkPointsForRange,
  sparkRangeShowsPointMarkers,
  windowSparkPoints,
  type SparkPoint,
} from "./portfolioSnapshotSeries";

const pts = (...days: string[]): SparkPoint[] =>
  days.map((time, i) => ({ time, value: i }));

describe("windowSparkPoints", () => {
  it("keeps the trailing calendar week ending on the last point", () => {
    const points = pts(
      "2026-07-01",
      "2026-07-10",
      "2026-07-16",
      "2026-07-17",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    );
    expect(windowSparkPoints(points, 7).map((p) => p.time)).toEqual([
      "2026-07-16",
      "2026-07-17",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    ]);
  });

  it("returns empty for empty input", () => {
    expect(windowSparkPoints([], 7)).toEqual([]);
  });
});

describe("sparkPointsForRange", () => {
  it("maps 1w to a 7-day window", () => {
    const points = pts("2026-07-01", "2026-07-16", "2026-07-22");
    expect(sparkPointsForRange(points, "1w").map((p) => p.time)).toEqual([
      "2026-07-16",
      "2026-07-22",
    ]);
  });

  it("maps ytd from Jan 1 of the end year", () => {
    const points = pts("2025-12-31", "2026-01-02", "2026-07-22");
    expect(sparkPointsForRange(points, "ytd").map((p) => p.time)).toEqual([
      "2026-01-02",
      "2026-07-22",
    ]);
  });
});

describe("sparkRangeShowsPointMarkers", () => {
  it("only enables markers on the week view", () => {
    expect(sparkRangeShowsPointMarkers("1w")).toBe(true);
    expect(sparkRangeShowsPointMarkers("1m")).toBe(false);
    expect(sparkRangeShowsPointMarkers("1y")).toBe(false);
    expect(sparkRangeShowsPointMarkers("ytd")).toBe(false);
  });
});

describe("seriesToConvictionSparkPoints", () => {
  it("reads metrics.conviction and skips empty metrics", () => {
    const rows = [
      {
        asOf: "2026-07-20",
        openPnlPct: 1,
        metrics: { conviction: 80 },
      },
      {
        asOf: "2026-07-21",
        openPnlPct: 2,
        metrics: {},
      },
      {
        asOf: "2026-07-22",
        openPnlPct: 3,
        metrics: { conviction: 86 },
      },
    ] as Parameters<typeof seriesToConvictionSparkPoints>[0];
    expect(seriesToConvictionSparkPoints(rows)).toEqual([
      { time: "2026-07-20", value: 80 },
      { time: "2026-07-22", value: 86 },
    ]);
  });

  it("skips exact-zero marks from the stale holding.conviction persist bug", () => {
    const rows = [
      {
        asOf: "2026-07-22",
        openPnlPct: 1,
        metrics: { conviction: 0 },
      },
    ] as unknown as Parameters<typeof seriesToConvictionSparkPoints>[0];
    expect(seriesToConvictionSparkPoints(rows)).toEqual([]);
  });
});

describe("displaySparkPointsForRange", () => {
  it("seeds a live point when history is empty but loaded", () => {
    expect(
      displaySparkPointsForRange([], "1w", {
        loaded: true,
        seedValue: 86,
        seedTime: "2026-07-22",
      }),
    ).toEqual([{ time: "2026-07-22", value: 86 }]);
  });
});

describe("etIsoDate", () => {
  it("passes through bare calendar dates", () => {
    expect(etIsoDate("2026-07-21")).toBe("2026-07-21");
  });

  it("maps an afternoon ET check stamp to that ET calendar day", () => {
    // 2026-07-21 16:00 EDT = 20:00 UTC
    expect(etIsoDate("2026-07-21T20:00:00.000Z")).toBe("2026-07-21");
  });
});

describe("latestEtDay", () => {
  it("picks the freshest ET session day", () => {
    expect(
      latestEtDay([
        "2026-07-20T20:00:00.000Z",
        "2026-07-21T20:00:00.000Z",
        undefined,
      ]),
    ).toBe("2026-07-21");
  });
});

describe("clipSparkPointsThrough", () => {
  it("drops points after the last check day", () => {
    expect(
      clipSparkPointsThrough(pts("2026-07-20", "2026-07-21", "2026-07-22"), "2026-07-21").map(
        (p) => p.time,
      ),
    ).toEqual(["2026-07-20", "2026-07-21"]);
  });
});
