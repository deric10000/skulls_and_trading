import { describe, expect, it, vi } from "vitest";
import {
  formatMarketDataThrough,
  formatWeatherProvenance,
} from "./format";

describe("market-data cutoff formatting", () => {
  it("formats a market-date key without crossing the Eastern date boundary", () => {
    expect(formatMarketDataThrough("2026-07-30")).toBe("Jul 30");
  });

  it("separates observation, publication, and carried-forward provenance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:00:00.000Z"));
    try {
      expect(formatWeatherProvenance({
        dataAsOf: "2026-07-30",
        updatedAt: "2026-07-31T08:29:00.000Z",
        staleInputs: ["IWM"],
      })).toBe(
        "Market data through Jul 30 close · Updated 4:29 AM EDT · Carried forward: IWM",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
