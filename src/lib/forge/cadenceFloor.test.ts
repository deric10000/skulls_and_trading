import { describe, expect, it } from "vitest";
import type { Portfolio, RuleChip, Strategy } from "../../types";
import {
  ENABLED_CADENCE,
  ENABLED_CANDLE,
  checkBoundaryForCycle,
  clampCadenceInterval,
  clampCandleInterval,
  nextCadenceAt,
  sessionCycleBoundary,
  tickersForStrategy,
} from "./scheduler";
import {
  isSubHourTechnicalChip,
  migrateStrategyTimeframeFloor,
} from "./timeframeFloor";

const technicalChip = (dateRange: RuleChip["dateRange"]): RuleChip => ({
  id: `chip-${dateRange}`,
  label: "Price above 10 EMA",
  category: "setup",
  metric: "priceVsEma10Pct",
  dateRange,
  operator: ">",
  value: 0,
  weightPct: 100,
  enabled: true,
});

describe("reliable cadence floor", () => {
  it("clamps every sub-hour cadence to 1h", () => {
    expect(clampCadenceInterval("15m")).toBe("1h");
    expect(clampCadenceInterval("30m")).toBe("1h");
    expect(clampCandleInterval("15m")).toBe("1h");
    expect(clampCandleInterval("30m")).toBe("1h");
    expect(ENABLED_CADENCE).not.toContain("30m");
    expect(ENABLED_CANDLE).not.toContain("30m");
    expect(ENABLED_CANDLE).toContain("2h");
  });

  it("migrates conviction and Layer 3 technical chips", () => {
    const strategy = {
      id: "test",
      name: "Test strategy",
      description: "",
      isDefault: false,
      enabled: true,
      timeframe: [],
      tags: [],
      decisionSignals: [],
      exitLogic: [],
      rules: [technicalChip("30m")],
      trimZoneRules: [technicalChip("15m")],
    } satisfies Strategy;

    const migrated = migrateStrategyTimeframeFloor(strategy, false);
    expect(migrated.rules?.[0]?.dateRange).toBe("1h");
    expect(migrated.trimZoneRules?.[0]?.dateRange).toBe("1h");
    expect(isSubHourTechnicalChip(migrated.rules![0]!)).toBe(false);
  });

  it("aligns slower strategy checks to closed ET candle boundaries", () => {
    const strategy = {
      id: "four-hour",
      name: "Four hour",
      description: "",
      isDefault: false,
      enabled: true,
      timeframe: [],
      tags: [],
      decisionSignals: [],
      exitLogic: [],
      checkInterval: "4h",
    } satisfies Strategy;
    // July is EDT: 17:00Z = 13:00 ET, so the last 4h boundary is 12:00 ET.
    expect(
      checkBoundaryForCycle(strategy, "2026-07-21T17:00:00.000Z"),
    ).toBe("2026-07-21T16:00:00.000Z");
  });

  it("keeps session checks pinned to the selected close", () => {
    expect(
      sessionCycleBoundary(
        "close-regular",
        new Date("2026-07-21T21:05:00.000Z"),
      ),
    ).toBe("2026-07-21T20:00:00.000Z");
    expect(
      sessionCycleBoundary(
        "close-premarket",
        new Date("2026-07-21T14:00:00.000Z"),
      ),
    ).toBe("2026-07-21T14:00:00.000Z");
  });

  it("nextCadenceAt uses real ET walls, not now+interval", () => {
    // Tue Jul 21 2026 16:28 ET = 20:28Z — after regular close → Wed 16:00 ET.
    expect(nextCadenceAt("1D", new Date("2026-07-21T20:28:00.000Z"))).toBe(
      "2026-07-22T20:00:00.000Z",
    );
    // Before regular close same day → today 16:00 ET.
    expect(nextCadenceAt("1D", new Date("2026-07-21T18:00:00.000Z"))).toBe(
      "2026-07-21T20:00:00.000Z",
    );
    // Hourly wall (UTC hour boundaries match Worker hourBoundary).
    expect(nextCadenceAt("1h", new Date("2026-07-21T20:28:00.000Z"))).toBe(
      "2026-07-21T21:00:00.000Z",
    );
    expect(
      nextCadenceAt("close-regular", new Date("2026-07-21T20:28:00.000Z")),
    ).toBe("2026-07-22T20:00:00.000Z");
  });

  it("scopes custom strategy checks to applied, non-excluded tickers", () => {
    const strategy = {
      id: "custom",
      name: "Custom",
      description: "",
      isDefault: false,
      enabled: true,
      timeframe: [],
      tags: [],
      decisionSignals: [],
      exitLogic: [],
      appliedPortfolioIds: ["book"],
      tickerExclusions: { book: ["MSFT"] },
    } satisfies Strategy;
    const portfolios = [
      {
        id: "book",
        label: "Book",
        type: "portfolio",
        holdings: [
          {
            ticker: "AAPL",
            shares: 1,
            avgPrice: 100,
            openPnlPct: 0,
            conviction: 0,
            status: "No Strategy",
            reason: "",
            strategyIds: [],
          },
          {
            ticker: "MSFT",
            shares: 1,
            avgPrice: 100,
            openPnlPct: 0,
            conviction: 0,
            status: "No Strategy",
            reason: "",
            strategyIds: [],
          },
        ],
      },
    ] satisfies Portfolio[];
    expect(tickersForStrategy(strategy, portfolios)).toEqual(["AAPL"]);
  });
});
