import { describe, expect, it } from "vitest";
import {
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
