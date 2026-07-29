import { describe, expect, it } from "vitest";
import {
  classifyPreflightFailure,
  incompleteCycleTickers,
  missingCycleSymbols,
} from "./scoringPreflight";

describe("conviction preflight", () => {
  it("detects symbols absent from the completed cycle", () => {
    expect(
      missingCycleSymbols(["GOOG", "CRWV", "CELH"], {
        symbols: ["GOOG", "NVDA"],
      }),
    ).toEqual(["CELH", "CRWV"]);
  });

  it("detects incomplete quote/technical coverage", () => {
    expect(
      incompleteCycleTickers(["GOOG", "NVDA"], {
        quotes: { GOOG: {} },
        technicals: { GOOG: {} },
      }),
    ).toEqual(["NVDA"]);
  });

  it("classifies missing symbols before incomplete data", () => {
    const failure = classifyPreflightFailure({
      missingFromCycle: ["ACHR"],
      incompleteTickers: ["GOOG"],
      hasContext: true,
    });
    expect(failure?.category).toBe("cycle_missing_symbol");
    expect(failure?.status).toBe("waiting_for_data");
  });
});
