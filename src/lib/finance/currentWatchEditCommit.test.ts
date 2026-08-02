import { describe, expect, it } from "vitest";
import type { Portfolio } from "../../types";
import { resolveStatus } from "../forge/status";
import { buildCurrentWatchEditCommit } from "./currentWatchEditCommit";
import {
  buildCurrentWatchPendingReview,
  cashDraftForBatch,
  currentWatchCommitFailureMessage,
  reviewCurrentWatchTimeline,
} from "./currentWatchEditWorkflow";
import { currentWatchCommitFailureReason } from "../userStore/currentWatchEditStore";

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
      cashBefore: 1000,
      cashAfter: 1500,
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

  it("funds same-timestamp buys from a deposit (cash before qty on ties)", () => {
    const at = "2026-08-02T15:30:00.000Z";
    const reviewed = reviewCurrentWatchTimeline({
      startingCash: 0,
      cash: {
        side: "deposit",
        cashBefore: 0,
        cashAfter: 150_000,
        deltaCash: 150_000,
        filledAt: at,
        timeZone: "America/New_York",
      },
      orders: [
        {
          ticker: "AMD",
          side: "buy",
          deltaShares: 110,
          sharesBefore: 0,
          sharesAfter: 110,
          fillPrice: 476.15,
          filledAt: at,
          timeZone: "America/New_York",
        },
        {
          ticker: "MO",
          side: "buy",
          deltaShares: 50,
          sharesBefore: 0,
          sharesAfter: 50,
          fillPrice: 68.33,
          filledAt: at,
          timeZone: "America/New_York",
        },
      ],
    });
    expect("error" in reviewed).toBe(false);
    if ("error" in reviewed) return;

    const empty = {
      id: "new-book",
      label: "New",
      type: "portfolio" as const,
      revision: 0,
      cashAvailable: 0,
      holdings: [],
    };
    const prepared = buildCurrentWatchEditCommit({
      portfolio: empty,
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
      getLastPrice: (ticker) => (ticker === "AMD" ? 476.15 : 68.33),
      orders: reviewed.orders,
      cash: reviewed.cash,
      finalCash: reviewed.finalCash,
      nextId: (prefix) => `${prefix}-1-1`,
    });

    expect(prepared.transactions.map((tx) => tx.kind)).toEqual([
      "cash",
      "qty",
      "qty",
    ]);
    expect(prepared.transactions[0]).toMatchObject({
      kind: "cash",
      cashBefore: 0,
      cashAfter: 150_000,
    });
    expect(prepared.transactions[1]).toMatchObject({
      ticker: "AMD",
      cashBefore: 150_000,
      cashAfter: 97_623.5,
    });
    expect(prepared.transactions[2]).toMatchObject({
      ticker: "MO",
      cashBefore: 97_623.5,
      cashAfter: 94_207,
    });
    expect(prepared.portfolio.cashAvailable).toBe(94_207);
  });
});

describe("cashDraftForBatch", () => {
  const cashDraft = {
    side: "deposit" as const,
    cashBefore: 0,
    cashAfter: 500,
    deltaCash: 500,
    filledAt: "2026-08-01T15:00:00.000Z",
    timeZone: "America/New_York",
  };

  it("carries a staged first deposit into Batch Transactions", () => {
    expect(cashDraftForBatch(cashDraft, 0)).toEqual({
      cash: cashDraft,
      error: null,
    });
  });

  it("blocks a later dirty cash draft instead of dropping it", () => {
    expect(cashDraftForBatch(cashDraft, 1000)).toEqual({
      cash: null,
      error:
        "Update or cancel the staged cash change before opening Batch Transactions.",
    });
  });
});

describe("Current Watch commit errors", () => {
  it("identifies an environment missing the atomic save RPC", () => {
    const reason = currentWatchCommitFailureReason({
      code: "PGRST202",
      message:
        "Could not find the function public.commit_current_watch_edit in the schema cache",
    });
    expect(reason).toBe("schema-unavailable");
    expect(currentWatchCommitFailureMessage("schema-unavailable")).toContain(
      "database migrations",
    );
  });

  it("distinguishes reconciliation failures from infrastructure failures", () => {
    expect(
      currentWatchCommitFailureReason({
        message: "invalid_manual_cash_math",
      }),
    ).toBe("invalid-math");
    expect(currentWatchCommitFailureReason({ message: "Failed to fetch" })).toBe(
      "save-unavailable",
    );
  });
});
