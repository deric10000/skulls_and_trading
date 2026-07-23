import { describe, expect, it } from "vitest";
import { mapYahooTaxonomy } from "./yahooTaxonomy";

describe("mapYahooTaxonomy", () => {
  it("maps Yahoo Technology / Software—Application to GICS", () => {
    const result = mapYahooTaxonomy("Technology", "Software—Application");
    expect(result.sector).toBe("Information Technology");
    expect(result.industry).toBe("Software");
    expect(result.gapReason).toBeNull();
  });

  it("does not invent IT/Software when provider fields are empty", () => {
    const result = mapYahooTaxonomy(null, null);
    expect(result.sector).toBeNull();
    expect(result.industry).toBeNull();
    expect(result.gapReason).toBe("missing_provider");
  });

  it("keeps a mapped sector when industry fails", () => {
    const result = mapYahooTaxonomy("Technology", "Totally Fake Industry XYZ");
    expect(result.sector).toBe("Information Technology");
    expect(result.industry).toBeNull();
    expect(result.gapReason).toBe("unmapped_yahoo");
  });

  it("flags unmapped Yahoo industry strings", () => {
    const result = mapYahooTaxonomy(null, "Totally Fake Industry XYZ");
    expect(result.sector).toBeNull();
    expect(result.industry).toBeNull();
    expect(result.gapReason).toBe("unmapped_yahoo");
    expect(result.providerIndustry).toBe("Totally Fake Industry XYZ");
  });

  it("uses industry parent when Yahoo sector is missing", () => {
    const result = mapYahooTaxonomy(null, "Software—Infrastructure");
    expect(result.sector).toBe("Information Technology");
    expect(result.industry).toBe("Software");
    expect(result.gapReason).toBeNull();
  });
});
