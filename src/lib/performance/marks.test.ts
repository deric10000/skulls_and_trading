import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPerformanceSummary,
  measureAsync,
  measureSync,
  perfCount,
  perfValue,
} from "./marks";

describe("performance marks", () => {
  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  it("aggregates safe counts and values", () => {
    perfCount("market-boot", 1);
    perfCount("market-boot", 2);
    perfValue("payload-bytes", 123);

    expect(getPerformanceSummary()).toMatchObject({
      counts: { "market-boot": 3 },
      values: { "payload-bytes": [123] },
    });
  });

  it("returns results while recording sync and async durations", async () => {
    const now = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(15)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(28);

    expect(measureSync("sync", () => "ok")).toBe("ok");
    await expect(measureAsync("async", async () => "done")).resolves.toBe("done");

    const summary = getPerformanceSummary();
    expect(summary.values["duration:sync"]).toEqual([5]);
    expect(summary.values["duration:async"]).toEqual([8]);
    now.mockRestore();
  });
});

