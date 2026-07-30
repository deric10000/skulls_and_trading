import { describe, expect, it } from "vitest";
import type { WeatherBenchmarksPayload } from "../market/client";
import {
  assertGicsSectorSpdrMap,
  GICS_SECTOR_TO_SPDR,
  SECTOR_SPDR_SYMBOLS,
  spdrForGicsSector,
} from "./sectorSpdr";
import {
  buildAllSectorV2Readings,
  buildSectorV2Reading,
} from "./sectorV2Adapter";
import { GICS_SECTORS } from "./taxonomy";

const xlK: WeatherBenchmarksPayload["benchmarks"][string] = {
  asOf: "2026-07-29T20:00:00.000Z",
  price: 220,
  ema10: 215,
  ema20: 210,
  sma20: 208,
  sma50: 200,
  sma200: 180,
  atrPct: 1.5,
  atrPctBaseline60d: 1.4,
  drawdownFrom20dHighPct: 2,
  rsi14: 62,
  return5dPct: 3,
  return20dPct: 7,
  rsVsSpy5d: 0.5,
  rsVsSpy20d: 1.2,
};

const weather: WeatherBenchmarksPayload = {
  status: "complete",
  completedAt: "2026-07-29T20:30:00.000Z",
  expectedSymbols: [],
  freshSymbols: [],
  missingSymbols: [],
  benchmarks: {
    SPY: {
      asOf: "2026-07-29T20:00:00.000Z",
      price: 620,
      return5dPct: 2.5,
      return20dPct: 5.8,
      atrPct: 1.2,
      ema20: 600,
      sma50: 580,
    },
    XLK: xlK,
  },
  sectorSpdrOutperformingFreshCount: 11,
  sectorSpdrAboveSma50FreshCount: 11,
};

describe("GICS → SPDR SSOT", () => {
  it("maps all 11 GICS sectors bijectively onto Select Sector SPDRs", () => {
    assertGicsSectorSpdrMap();
    expect(Object.keys(GICS_SECTOR_TO_SPDR)).toEqual([...GICS_SECTORS]);
    expect(SECTOR_SPDR_SYMBOLS).toHaveLength(11);
    expect(spdrForGicsSector("Information Technology")).toBe("XLK");
    expect(spdrForGicsSector("Energy")).toBe("XLE");
  });
});

describe("Sector V2 adapter", () => {
  it("builds Information Technology from XLK without market tilt", () => {
    const reading = buildSectorV2Reading("Information Technology", weather, {
      higherLayerIndex: 70,
    });
    expect(reading.spdr).toBe("XLK");
    expect(reading.coverage).not.toBe("insufficient");
    expect(reading.pillars.structure).toBeTypeOf("number");
    expect(reading.pillars.relativeStrength).toBeTypeOf("number");
    expect(reading.condition.kind).toBe("condition");
  });

  it("returns insufficient when the mapped SPDR is missing (G18)", () => {
    const reading = buildSectorV2Reading("Financials", weather);
    expect(reading.spdr).toBe("XLF");
    expect(reading.coverage).toBe("insufficient");
    expect(reading.condition).toEqual({
      kind: "insufficient",
      coverage: "insufficient",
    });
  });

  it("never relabels an unknown sector as Information Technology", () => {
    const reading = buildSectorV2Reading("Imaginary Sector", weather);
    expect(reading.sector).toBeNull();
    expect(reading.spdr).toBeNull();
    expect(reading.coverage).toBe("insufficient");
  });

  it("evaluates coverage for the mapped sector instead of unrelated global gaps", () => {
    const reading = buildSectorV2Reading("Information Technology", {
      ...weather,
      status: "provisional",
      missingSymbols: ["IWM"],
      freshnessBySymbol: { XLK: "fresh" },
    });
    expect(reading.coverage).toBe("complete");
  });

  it("marks a carried mapped SPDR partial rather than fresh or unavailable", () => {
    const reading = buildSectorV2Reading("Information Technology", {
      ...weather,
      freshnessBySymbol: { XLK: "stale" },
      benchmarks: {
        ...weather.benchmarks,
        XLK: { ...xlK, freshness: "stale" },
      },
    });
    expect(reading.coverage).toBe("partial");
  });

  it("fires Rotation Current when RS improvement and confirmation clear (G17)", () => {
    const strongRs = {
      ...weather,
      benchmarks: {
        ...weather.benchmarks,
        XLK: {
          ...xlK,
          rsVsSpy5d: 4,
          rsVsSpy20d: 6,
        },
      },
    };
    const reading = buildSectorV2Reading("Information Technology", strongRs, {
      relativeStrengthImprovement: 2.5,
      hasPriorFreshV2Cycle: true,
    });
    expect(reading.condition).toMatchObject({
      kind: "condition",
      conditionId: "rotation-current",
    });
  });

  it("builds all eleven sectors without fabricating missing SPDRs", () => {
    const readings = buildAllSectorV2Readings(weather);
    expect(readings).toHaveLength(11);
    const tech = readings.find((row) => row.sector === "Information Technology");
    const energy = readings.find((row) => row.sector === "Energy");
    expect(tech?.coverage).not.toBe("insufficient");
    expect(energy?.coverage).toBe("insufficient");
  });
});
