import { describe, expect, it } from "vitest";
import {
  computeZoneFollowedImpact,
  countActions,
  countNotifications,
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

describe("countNotifications", () => {
  it("counts primary + distinct flags per status event", () => {
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
  it("tallies ledger fills and hold events", () => {
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
      total: 2,
      buy: 1,
      sell: 0,
      deposit: 0,
      withdrawal: 0,
      hold: 1,
    });
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
    expect(countNotifications(merged, "p1", ["s1"], bounds)).toBe(2);
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
