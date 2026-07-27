import { describe, expect, it } from "vitest";
import { nextCheckBoundary } from "./cadence";

describe("backend cadence boundaries", () => {
  it("preserves hourly and ET session-close walls", () => {
    expect(
      nextCheckBoundary("1h", "2026-07-27T20:07:00.000Z"),
    ).toBe("2026-07-27T21:00:00.000Z");
    expect(
      nextCheckBoundary("close-regular", "2026-07-27T19:59:00.000Z"),
    ).toBe("2026-07-27T20:00:00.000Z");
  });

  it("skips weekend session closes", () => {
    expect(
      nextCheckBoundary("close-regular", "2026-07-31T20:00:00.000Z"),
    ).toBe("2026-08-03T20:00:00.000Z");
  });
});
