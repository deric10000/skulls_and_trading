import { describe, expect, it } from "vitest";
import {
  computeZoneFollowedImpact,
  computeAverageHoldTime,
  countActions,
  countNotifications,
  summarizeNotificationCampaigns,
  forwardReturnPct,
  hadQtyFillInBucket,
  mergeCheckEventsWithProxies,
  type ForgeCheckEvent,
} from "./planAdherence";
import type { PortfolioTransaction } from "../../types";

function qtyTx(
  partial: Omit<Extract<PortfolioTransaction, { kind: "qty" }>, "source" | "kind"> & {
    kind?: "qty";
  },
): PortfolioTransaction {
  return { source: "mock", kind: "qty", ...partial };
}

const bounds = {
  fromIso: "2026-07-15T00:00:00.000Z",
  toIso: "2026-07-22T23:59:59.000Z",
  fromDate: "2026-07-15",
  toDate: "2026-07-22",
};

describe("summarizeNotificationCampaigns", () => {
  it("counts continuous flags as one episode and restarts after a clear", () => {
    const events: ForgeCheckEvent[] = [
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-15T20:00:00.000Z",
        asOf: "2026-07-15",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone"],
        conviction: 70,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-16T20:00:00.000Z",
        asOf: "2026-07-16",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone"],
        conviction: 70,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-17T20:00:00.000Z",
        asOf: "2026-07-17",
        kind: "status",
        primaryStatus: "Aligned",
        flags: ["Aligned"],
        conviction: 80,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-18T20:00:00.000Z",
        asOf: "2026-07-18",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone"],
        conviction: 65,
      },
    ];
    expect(
      summarizeNotificationCampaigns(events, "p1", ["s1"], bounds),
    ).toEqual({
      episodes: 2,
      newLaunches: 2,
      distinct: 1,
    });
  });

  it("does not treat a pre-window run as a new launch", () => {
    const events: ForgeCheckEvent[] = [
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-14T20:00:00.000Z",
        asOf: "2026-07-14",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone"],
        conviction: 70,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-15T20:00:00.000Z",
        asOf: "2026-07-15",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone"],
        conviction: 70,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-16T20:00:00.000Z",
        asOf: "2026-07-16",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone"],
        conviction: 70,
      },
    ];
    expect(
      summarizeNotificationCampaigns(events, "p1", ["s1"], bounds),
    ).toEqual({
      episodes: 1,
      newLaunches: 0,
      distinct: 1,
    });
  });

  it("counts Watch toward episodes/new but not need attention", () => {
    const events: ForgeCheckEvent[] = [
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-16T20:00:00.000Z",
        asOf: "2026-07-16",
        kind: "status",
        primaryStatus: "Watch",
        flags: ["Watch"],
        conviction: 55,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "AAPL",
        checkedAt: "2026-07-16T20:00:00.000Z",
        asOf: "2026-07-16",
        kind: "status",
        primaryStatus: "Review",
        flags: ["Review"],
        conviction: 40,
      },
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "MSFT",
        checkedAt: "2026-07-16T20:00:00.000Z",
        asOf: "2026-07-16",
        kind: "status",
        primaryStatus: "Add Zone",
        flags: ["Add Zone"],
        conviction: 75,
      },
    ];
    expect(
      summarizeNotificationCampaigns(events, "p1", ["s1"], bounds),
    ).toEqual({
      episodes: 3,
      newLaunches: 3,
      distinct: 2,
    });
  });
});

describe("countNotifications", () => {
  it("delegates to continuity-aware episode count", () => {
    const events: ForgeCheckEvent[] = [
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-21T20:00:00.000Z",
        asOf: "2026-07-21",
        kind: "status",
        primaryStatus: "Trim Zone",
        flags: ["Trim Zone", "Thesis Check"],
        conviction: 70,
      },
    ];
    expect(countNotifications(events, "p1", ["s1"], bounds)).toBe(2);
  });
});

describe("countActions", () => {
  it("tallies ledger fills without folding holds into the total", () => {
    const ledger: PortfolioTransaction[] = [
      qtyTx({
        id: "1",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "buy",
        deltaShares: 10,
        sharesBefore: 0,
        sharesAfter: 10,
        fillPrice: 10,
        filledAt: "2026-07-20T15:00:00.000Z",
      }),
    ];
    const events: ForgeCheckEvent[] = [
      {
        portfolioId: "p1",
        strategyId: "s1",
        ticker: "SOFI",
        checkedAt: "2026-07-21T20:00:00.000Z",
        asOf: "2026-07-21",
        kind: "hold",
        primaryStatus: null,
        flags: [],
        conviction: 80,
      },
    ];
    expect(countActions(ledger, events, "p1", null, bounds)).toEqual({
      total: 1,
      buy: 1,
      sell: 0,
      deposit: 0,
      withdrawal: 0,
      hold: 1,
    });
  });

  it("tracks cash without folding it into Total Actions", () => {
    const ledger: PortfolioTransaction[] = [
      qtyTx({
        id: "1",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "buy",
        deltaShares: 10,
        sharesBefore: 0,
        sharesAfter: 10,
        fillPrice: 10,
        filledAt: "2026-07-20T15:00:00.000Z",
      }),
      {
        id: "c1",
        kind: "cash",
        portfolioId: "p1",
        actionClass: "deposit",
        deltaCash: 100,
        cashBefore: 0,
        cashAfter: 100,
        filledAt: "2026-07-20T16:00:00.000Z",
        source: "mock",
      },
    ];
    expect(countActions(ledger, [], "p1", null, bounds)).toMatchObject({
      total: 1,
      buy: 1,
      deposit: 1,
    });
  });
});

describe("computeAverageHoldTime", () => {
  it("splits sell-to-zero and re-entry into separate episodes", () => {
    const ledger: PortfolioTransaction[] = [
      qtyTx({
        id: "1",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "buy",
        deltaShares: 10,
        sharesBefore: 0,
        sharesAfter: 10,
        fillPrice: 10,
        filledAt: "2026-06-01T15:00:00.000Z",
      }),
      qtyTx({
        id: "2",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "sell",
        deltaShares: -10,
        sharesBefore: 10,
        sharesAfter: 0,
        fillPrice: 12,
        filledAt: "2026-06-15T15:00:00.000Z",
      }),
      qtyTx({
        id: "3",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "buy",
        deltaShares: 5,
        sharesBefore: 0,
        sharesAfter: 5,
        fillPrice: 11,
        filledAt: "2026-07-01T15:00:00.000Z",
      }),
    ];
    const result = computeAverageHoldTime({
      ledger,
      portfolioId: "p1",
      currentSharesByTicker: { SOFI: 5 },
      strategyIds: null,
      tickersInScope: ["SOFI"],
      asOfDate: "2026-07-11",
    });
    // Closed 14d (Jun 1→15) + open 10d (Jul 1→11) → mean 12
    expect(result.episodeCount).toBe(2);
    expect(result.avgDays).toBe(12);
    expect(result.sinceDate).toBe("2026-06-01");
  });

  it("returns null when there are no share episodes", () => {
    expect(
      computeAverageHoldTime({
        ledger: [],
        portfolioId: "p1",
        currentSharesByTicker: { SOFI: 0 },
        strategyIds: null,
        tickersInScope: ["SOFI"],
        asOfDate: "2026-07-11",
      }),
    ).toEqual({ avgDays: null, episodeCount: 0, sinceDate: null });
  });
});

describe("forwardReturnPct / zone impact", () => {
  it("scores trim sells positive when price falls after", () => {
    expect(
      forwardReturnPct({ side: "sell", fillPrice: 100, horizonPrice: 90 }),
    ).toBe(10);
  });

  it("returns null impact with no zone-followed fills", () => {
    expect(
      computeZoneFollowedImpact([], [], "p1", null, bounds).avgReturnPct,
    ).toBeNull();
  });

  it("aggregates zone-followed trim impact", () => {
    const ledger: PortfolioTransaction[] = [
      qtyTx({
        id: "1",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "sell",
        deltaShares: -10,
        sharesBefore: 20,
        sharesAfter: 10,
        fillPrice: 100,
        filledAt: "2026-07-16T15:00:00.000Z",
        actionClass: "trim",
        zoneHints: ["Trim Zone"],
      }),
    ];
    const marks = [
      { ticker: "SOFI", asOf: "2026-07-17", lastPrice: 98 },
      { ticker: "SOFI", asOf: "2026-07-18", lastPrice: 95 },
      { ticker: "SOFI", asOf: "2026-07-19", lastPrice: 92 },
      { ticker: "SOFI", asOf: "2026-07-20", lastPrice: 90 },
      { ticker: "SOFI", asOf: "2026-07-21", lastPrice: 88 },
    ];
    const result = computeZoneFollowedImpact(
      ledger,
      marks,
      "p1",
      null,
      bounds,
      5,
    );
    expect(result.matchedFills).toBe(1);
    expect(result.consideredFills).toBe(1);
    expect(result.avgReturnPct).toBeCloseTo(12, 5);
  });

  it("reports considered fills when none matched a zone", () => {
    const ledger: PortfolioTransaction[] = [
      qtyTx({
        id: "1",
        portfolioId: "p1",
        ticker: "SOFI",
        side: "buy",
        deltaShares: 10,
        sharesBefore: 0,
        sharesAfter: 10,
        fillPrice: 10,
        filledAt: "2026-07-20T15:00:00.000Z",
        actionClass: "add",
        zoneHints: [],
      }),
    ];
    const result = computeZoneFollowedImpact(
      ledger,
      [],
      "p1",
      null,
      bounds,
    );
    expect(result.matchedFills).toBe(0);
    expect(result.consideredFills).toBe(1);
    expect(result.avgReturnPct).toBeNull();
  });
});

describe("mergeCheckEventsWithProxies", () => {
  it("fills notification gaps from book conviction marks", () => {
    const merged = mergeCheckEventsWithProxies({
      events: [],
      portfolioId: "p1",
      snapshotRows: [],
      bookCheckDays: [
        { strategyId: "s1", asOf: "2026-07-21", conviction: 93 },
      ],
      tickers: ["SOFI", "ACHR"],
    });
    expect(merged.filter((e) => e.kind === "status")).toHaveLength(2);
    // High Alignment is not an alert campaign — episode count stays 0.
    expect(countNotifications(merged, "p1", ["s1"], bounds)).toBe(0);
    expect(
      merged.filter((e) => e.kind === "status").every(
        (e) => e.primaryStatus === "High Alignment",
      ),
    ).toBe(true);
    // No ledger fills → Hold per ticker on the check day.
    expect(merged.filter((e) => e.kind === "hold")).toHaveLength(2);
    expect(countActions([], merged, "p1", ["s1"], bounds).hold).toBe(2);
  });

  it("prefers real forge events over book proxies for the same day", () => {
    const merged = mergeCheckEventsWithProxies({
      events: [
        {
          portfolioId: "p1",
          strategyId: "s1",
          ticker: "SOFI",
          checkedAt: "2026-07-21T20:00:00.000Z",
          asOf: "2026-07-21",
          kind: "status",
          primaryStatus: "Exit Review",
          flags: ["Exit Review"],
          conviction: 40,
        },
      ],
      portfolioId: "p1",
      snapshotRows: [],
      bookCheckDays: [
        { strategyId: "s1", asOf: "2026-07-21", conviction: 93 },
      ],
      tickers: ["SOFI", "ACHR"],
    });
    expect(
      merged.filter((e) => e.ticker === "SOFI" && e.kind === "status")[0]
        ?.primaryStatus,
    ).toBe("Exit Review");
    // Day already has a real status event — skip book status proxy, still
    // synthesize Holds for tickers with no same-day fill.
    expect(merged.filter((e) => e.kind === "status")).toHaveLength(1);
    expect(merged.filter((e) => e.kind === "hold")).toHaveLength(2);
  });

  it("skips Hold when the ticker traded on the check day", () => {
    const merged = mergeCheckEventsWithProxies({
      events: [],
      portfolioId: "p1",
      snapshotRows: [],
      bookCheckDays: [
        { strategyId: "s1", asOf: "2026-07-21", conviction: 93 },
      ],
      tickers: ["SOFI", "ACHR"],
      ledger: [
        qtyTx({
          id: "1",
          portfolioId: "p1",
          ticker: "SOFI",
          side: "buy",
          deltaShares: 1,
          sharesBefore: 0,
          sharesAfter: 1,
          fillPrice: 10,
          filledAt: "2026-07-21T15:00:00.000Z",
        }),
      ],
    });
    expect(merged.filter((e) => e.kind === "hold").map((e) => e.ticker)).toEqual(
      ["ACHR"],
    );
  });

  it("counts holds across two check days with no trades", () => {
    const merged = mergeCheckEventsWithProxies({
      events: [],
      portfolioId: "p1",
      snapshotRows: [],
      bookCheckDays: [
        { strategyId: "s1", asOf: "2026-07-21", conviction: 93 },
        { strategyId: "s1", asOf: "2026-07-22", conviction: 93 },
      ],
      tickers: Array.from({ length: 10 }, (_, i) => `T${i}`),
    });
    expect(countActions([], merged, "p1", ["s1"], bounds).hold).toBe(20);
  });
});

describe("hadQtyFillInBucket", () => {
  it("detects a fill inside the cadence bucket", () => {
    expect(
      hadQtyFillInBucket({
        ledger: [
          qtyTx({
            id: "1",
            portfolioId: "p1",
            ticker: "SOFI",
            side: "buy",
            deltaShares: 1,
            sharesBefore: 0,
            sharesAfter: 1,
            fillPrice: 1,
            filledAt: "2026-07-21T18:00:00.000Z",
          }),
        ],
        portfolioId: "p1",
        ticker: "SOFI",
        bucketStartIso: "2026-07-21T16:00:00.000Z",
        checkedAtIso: "2026-07-21T20:00:00.000Z",
      }),
    ).toBe(true);
  });
});
