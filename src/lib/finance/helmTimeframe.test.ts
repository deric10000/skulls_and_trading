import { describe, expect, it } from "vitest";
import {
  availableHelmTimeframes,
  clampHelmTimeframe,
  helmCadenceFloorForScope,
  helmTimeframeBounds,
} from "./helmTimeframe";
import type { Strategy } from "../../types";

function stubStrategy(
  id: string,
  checkInterval: Strategy["checkInterval"],
): Strategy {
  return {
    id,
    name: id,
    description: "",
    checkInterval,
    appliedPortfolioIds: ["p1"],
  } as Strategy;
}

describe("helmCadenceFloorForScope", () => {
  it("uses the coarsest floor when All strategies", () => {
    expect(
      helmCadenceFloorForScope(
        [stubStrategy("a", "1h"), stubStrategy("b", "1D")],
        null,
      ),
    ).toBe("1D");
  });

  it("uses the focused strategy floor when scoped", () => {
    expect(
      helmCadenceFloorForScope(
        [stubStrategy("a", "1h"), stubStrategy("b", "1D")],
        "a",
      ),
    ).toBe("1h");
  });
});

describe("availableHelmTimeframes", () => {
  it("unlocks hourly windows only at a 1h floor", () => {
    expect(availableHelmTimeframes("1h")[0]).toBe("1h");
    expect(availableHelmTimeframes("1D")).toEqual([
      "1w",
      "1m",
      "1y",
      "ytd",
    ]);
  });
});

describe("clampHelmTimeframe", () => {
  it("falls back to 1w when the floor cannot support 1h", () => {
    expect(clampHelmTimeframe("1h", "1D")).toBe("1w");
  });
});

describe("helmTimeframeBounds", () => {
  it("returns from/to ISO bounds for 1w", () => {
    const end = new Date("2026-07-22T20:00:00.000Z");
    const bounds = helmTimeframeBounds("1w", end);
    expect(bounds.toIso).toBe(end.toISOString());
    expect(Date.parse(bounds.fromIso)).toBeLessThan(Date.parse(bounds.toIso));
  });
});
