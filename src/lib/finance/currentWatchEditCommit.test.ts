import { describe, expect, it } from "vitest";
import type { Portfolio } from "../../types";
import { resolveStatus } from "../forge/status";
import { buildCurrentWatchEditCommit } from "./currentWatchEditCommit";
import {
  buildCurrentWatchPendingReview,
  reviewCurrentWatchTimeline,
} from "./currentWatchEditWorkflow";

const portfolio: Portfolio = {
  id: "portfolio-1",
  label: "Current Portfolio",
  type: "portfolio",
  revision: 4,
  cashAvailable: 1000,
  holdings: [
    {
      ticker: "TEST",
      shares: 1,
      avgPrice: 100,
      openPnlPct: 0,
      conviction: 0,
      status: "No Strategy",
      reason: "Test holding",
      strategyIds: [],
    },
  ],
};

describe("buildCurrentWatchEditCommit", () => {
  it("builds the projection and ledger without mutating the edit draft", () => {
    const prepared = buildCurrentWatchEditCommit({
      portfolio,
      alignment: {
        byTicker: {},
        byBucket: {},
        portfolio: {
          conviction: 0,
          status: "No Strategy",
          resolved: resolveStatus(0, [], { hasStrategy: false }),
        },
      },
      appliedStrategyIds: [],
      getLastPrice: () => 120,
      orders: [
        {
          ticker: "TEST",
          side: "buy",
          deltaShares: 1,
          sharesBefore: 1,
          sharesAfter: 2,
          fillPrice: 120,
          cashBefore: 1000,
          cashAfter: 880,
          filledAt: "2026-08-01T16:00:00.000Z",
          timeZone: "America/New_York",
        },
      ],
      cash: null,
      finalCash: 880,
      nextId: (prefix) => `${prefix}-1-1`,
    });

    expect(prepared.portfolio.cashAvailable).toBe(880);
    expect(prepared.portfolio.holdings[0]).toMatchObject({
      ticker: "TEST",
      shares: 2,
      avgPrice: 110,
    });
    expect(prepared.transactions[0]).toMatchObject({
      id: "fill-1-1",
      sharesBefore: 1,
      sharesAfter: 2,
      cashBefore: 1000,
      cashAfter: 880,
    });
    expect(portfolio).toMatchObject({
      cashAvailable: 1000,
      holdings: [{ shares: 1, avgPrice: 100 }],
    });
  });
});

describe("reviewCurrentWatchTimeline", () => {
  it("builds reviewed orders and a manual cash slice from edit drafts", () => {
    const pending = buildCurrentWatchPendingReview({
      baseline: { TEST: 1 },
      drafts: { TEST: 2 },
      cashOffset: 500,
      cashBaseline: 1000,
      qtyImpact: -120,
      getLastPrice: () => 120,
      filledAt: "2026-08-01T16:00:00.000Z",
      timeZone: "America/New_York",
    });

    expect(pending.orders[0]).toMatchObject({
      ticker: "TEST",
      side: "buy",
      deltaShares: 1,
      fillPrice: 120,
    });
    expect(pending.cash).toMatchObject({
      side: "deposit",
      cashBefore: 880,
      cashAfter: 1380,
      deltaCash: 500,
    });
  });

  it("orders a deposit before a later buy and stamps continuous cash", () => {
    const reviewed = reviewCurrentWatchTimeline({
      startingCash: 0,
      cash: {
        side: "deposit",
        cashBefore: 0,
        cashAfter: 500,
        deltaCash: 500,
        filledAt: "2026-08-01T15:00:00.000Z",
        timeZone: "America/New_York",
      },
      orders: [
        {
          ticker: "TEST",
          side: "buy",
          deltaShares: 2,
          sharesBefore: 0,
          sharesAfter: 2,
          fillPrice: 100,
          filledAt: "2026-08-01T16:00:00.000Z",
          timeZone: "America/New_York",
        },
      ],
    });

    expect("error" in reviewed).toBe(false);
    if ("error" in reviewed) return;
    expect(reviewed.cash).toMatchObject({ cashBefore: 0, cashAfter: 500 });
    expect(reviewed.orders[0]).toMatchObject({ cashBefore: 500, cashAfter: 300 });
    expect(reviewed.finalCash).toBe(300);
  });
});
