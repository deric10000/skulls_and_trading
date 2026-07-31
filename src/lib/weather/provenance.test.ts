import { describe, expect, it } from "vitest";
import {
  earliestWeatherObservationDate,
  weatherObservationDate,
} from "./provenance";

describe("Weather observation provenance", () => {
  it("keeps date-only provider cutoffs stable in Eastern Time", () => {
    expect(weatherObservationDate("2026-07-30")).toBe("2026-07-30");
  });

  it("converts instants to the New York market date", () => {
    expect(weatherObservationDate("2026-07-31T00:30:00.000Z"))
      .toBe("2026-07-30");
  });

  it("uses the oldest valid observation as the shared cutoff", () => {
    expect(earliestWeatherObservationDate([
      "2026-07-31T08:29:00.000Z",
      "2026-07-30T20:00:00.000Z",
      "invalid",
    ])).toBe("2026-07-30");
  });
});
