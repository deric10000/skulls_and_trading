import { describe, expect, it } from "vitest";
import { isMarketPullOpen, nextMarketPullAt } from "./marketPullWindow";

describe("worker marketPullWindow", () => {
  it("idles Saturday and Sunday afternoon", () => {
    expect(isMarketPullOpen(Date.parse("2026-08-01T16:00:00.000Z"))).toBe(
      false,
    );
    expect(isMarketPullOpen(Date.parse("2026-08-02T16:58:00.000Z"))).toBe(
      false,
    );
  });

  it("publishes nextCycleAt to Sunday overnight after Friday close", () => {
    // Fri 20:00 ET publish → next eligible pull is Sun 20:00 ET
    expect(nextMarketPullAt(Date.parse("2026-08-01T00:00:00.000Z"))).toBe(
      "2026-08-03T00:00:00.000Z",
    );
    expect(nextMarketPullAt(Date.parse("2026-08-01T00:30:00.000Z"))).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });

  it("keeps hourly nextCycleAt while the pull window is open", () => {
    expect(nextMarketPullAt(Date.parse("2026-08-03T14:20:00.000Z"))).toBe(
      "2026-08-03T15:00:00.000Z",
    );
  });
});
