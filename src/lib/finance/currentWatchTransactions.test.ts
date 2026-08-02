import { describe, expect, it } from "vitest";
import type { Portfolio } from "../../types";
import {
  formatFractionalQuantityInput,
  formatQuantity,
  replayPortfolioTransactions,
  transactionFingerprint,
} from "./currentWatchTransactions";

const portfolio: Portfolio = {
  id: "p1",
  label: "Primary",
  type: "portfolio",
  cashAvailable: 1_000,
  holdings: [],
  revision: 3,
};

describe("replayPortfolioTransactions", () => {
  it("replays deposits, fractional buys, and sells chronologically", () => {
    const result = replayPortfolioTransactions({
      portfolio,
      transactions: [
        {
          id: "sell",
          type: "sell",
          ticker: "ABC",
          quantity: 0.25,
          fillPrice: 12,
          filledAt: "2026-01-03T15:00:00.000Z",
          timeZone: "America/New_York",
          source: "import",
        },
        {
          id: "buy",
          type: "buy",
          ticker: "abc",
          quantity: 1.25,
          fillPrice: 10,
          filledAt: "2026-01-02T15:00:00.000Z",
          timeZone: "America/New_York",
          source: "import",
        },
      ],
    });
    expect(result.issues).toEqual([]);
    expect(result.portfolio.holdings[0]).toMatchObject({ ticker: "ABC", shares: 1, avgPrice: 10 });
    expect(result.portfolio.cashAvailable).toBe(990.5);
    expect(result.portfolio.revision).toBe(4);
    expect(result.ledger.map((row) => row.id)).toEqual(["buy", "sell"]);
  });

  it("blocks a purchase that precedes its funding", () => {
    const result = replayPortfolioTransactions({
      portfolio: { ...portfolio, cashAvailable: 0 },
      transactions: [
        {
          id: "buy",
          type: "buy",
          ticker: "XYZ",
          quantity: 1,
          fillPrice: 100,
          filledAt: "2026-01-01T15:00:00.000Z",
          timeZone: "UTC",
          source: "import",
        },
        {
          id: "deposit",
          type: "deposit",
          amount: 500,
          filledAt: "2026-01-02T15:00:00.000Z",
          timeZone: "UTC",
          source: "import",
        },
      ],
    });
    expect(result.issues[0]?.code).toBe("insufficient-cash");
    expect(result.validTransactionIds).toEqual(["deposit"]);
  });

  it("can preserve current cash while imported trades update holdings", () => {
    const result = replayPortfolioTransactions({
      portfolio: { ...portfolio, cashAvailable: 25 },
      tradeCashTreatment: "preserve",
      transactions: [
        {
          id: "buy",
          type: "buy",
          ticker: "XYZ",
          quantity: 10,
          fillPrice: 100,
          filledAt: "2026-01-01T15:00:00.000Z",
          timeZone: "UTC",
          source: "import",
        },
        {
          id: "sell",
          type: "sell",
          ticker: "XYZ",
          quantity: 2,
          fillPrice: 110,
          filledAt: "2026-01-02T15:00:00.000Z",
          timeZone: "UTC",
          source: "import",
        },
      ],
    });
    expect(result.issues).toEqual([]);
    expect(result.portfolio.cashAvailable).toBe(25);
    expect(result.portfolio.holdings[0]).toMatchObject({
      ticker: "XYZ",
      shares: 8,
      avgPrice: 100,
    });
    expect(result.ledger.map((row) => [row.cashBefore, row.cashAfter])).toEqual([
      [25, 25],
      [25, 25],
    ]);
  });

  it("still applies explicit deposits when trade cash is preserved", () => {
    const result = replayPortfolioTransactions({
      portfolio: { ...portfolio, cashAvailable: 25 },
      tradeCashTreatment: "preserve",
      transactions: [{
        id: "deposit",
        type: "deposit",
        amount: 100,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
      }],
    });
    expect(result.issues).toEqual([]);
    expect(result.portfolio.cashAvailable).toBe(125);
  });

  it("flags exact duplicates without applying them", () => {
    const transaction = {
      id: "buy",
      type: "buy" as const,
      ticker: "XYZ",
      quantity: 1,
      fillPrice: 10,
      filledAt: "2026-01-01T15:00:00.000Z",
      timeZone: "UTC",
      source: "import" as const,
    };
    const fingerprint = transactionFingerprint(portfolio.id, transaction);
    const result = replayPortfolioTransactions({
      portfolio,
      transactions: [transaction],
      existingFingerprints: new Set([fingerprint]),
    });
    expect(result.issues[0]?.code).toBe("duplicate");
    expect(result.ledger).toEqual([]);
  });

  it("flags a same-time transaction with different values as a likely overlap", () => {
    const result = replayPortfolioTransactions({
      portfolio,
      transactions: [{
        id: "new",
        type: "buy",
        ticker: "XYZ",
        quantity: 2,
        fillPrice: 10,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
      }],
      existingTransactions: [{
        id: "old",
        kind: "qty",
        portfolioId: "p1",
        ticker: "XYZ",
        side: "buy",
        deltaShares: 1,
        sharesBefore: 0,
        sharesAfter: 1,
        fillPrice: 10,
        filledAt: "2026-01-01T15:00:00.000Z",
        source: "mock",
      }],
    });
    expect(result.issues[0]?.code).toBe("overlap");
  });

  it("names the ticker on oversell and insufficient-cash issues", () => {
    const oversell = replayPortfolioTransactions({
      portfolio,
      transactions: [{
        id: "sell",
        type: "sell",
        ticker: "XYZ",
        quantity: 10,
        fillPrice: 10,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
        sourceRow: 4,
      }],
    });
    expect(oversell.issues[0]).toMatchObject({
      code: "oversell",
      ticker: "XYZ",
      availableShares: 0,
      requiredShares: 10,
    });
    expect(oversell.issues[0]?.message).toContain("XYZ");

    const cashShort = replayPortfolioTransactions({
      portfolio: { ...portfolio, cashAvailable: 5 },
      transactions: [{
        id: "buy",
        type: "buy",
        ticker: "ABC",
        quantity: 1,
        fillPrice: 20,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
      }],
    });
    expect(cashShort.issues[0]).toMatchObject({
      code: "insufficient-cash",
      ticker: "ABC",
      availableCash: 5,
      requiredCash: 20,
    });
    expect(cashShort.issues[0]?.message).toContain("ABC");
  });

  it("can clamp an oversell to the accounted position ending at zero", () => {
    const result = replayPortfolioTransactions({
      portfolio: {
        ...portfolio,
        holdings: [{
          ticker: "XYZ",
          shares: 3,
          avgPrice: 10,
          openPnlPct: 0,
          conviction: 0,
          status: "No Strategy",
          reason: "",
          strategyIds: [],
        }],
      },
      transactions: [{
        id: "sell",
        type: "sell",
        ticker: "XYZ",
        quantity: 10,
        fillPrice: 12,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
        oversellResolution: "close-to-zero",
      }],
    });
    expect(result.issues).toEqual([]);
    expect(result.ledger[0]).toMatchObject({
      kind: "qty",
      ticker: "XYZ",
      side: "sell",
      deltaShares: 3,
      sharesBefore: 3,
      sharesAfter: 0,
    });
  });

  it("can resolve an oversell to a chosen total qty left", () => {
    const result = replayPortfolioTransactions({
      portfolio: {
        ...portfolio,
        holdings: [{
          ticker: "XYZ",
          shares: 10,
          avgPrice: 10,
          openPnlPct: 0,
          conviction: 0,
          status: "No Strategy",
          reason: "",
          strategyIds: [],
        }],
      },
      transactions: [{
        id: "sell",
        type: "sell",
        ticker: "XYZ",
        quantity: 50,
        fillPrice: 12,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
        oversellResolution: "set-qty-left",
        targetSharesAfter: 2,
      }],
    });
    expect(result.issues).toEqual([]);
    expect(result.ledger[0]).toMatchObject({
      kind: "qty",
      deltaShares: 8,
      sharesBefore: 10,
      sharesAfter: 2,
    });
  });

  it("does not invent shares when clamp-to-held has nothing accounted", () => {
    const result = replayPortfolioTransactions({
      portfolio,
      transactions: [{
        id: "sell",
        type: "sell",
        ticker: "XYZ",
        quantity: 10,
        fillPrice: 12,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
        oversellPolicy: "clamp-to-held",
      }],
    });
    expect(result.issues[0]?.code).toBe("oversell");
    expect(result.ledger).toEqual([]);
  });

  it("can record a zero-accounted sell as an untracked close to zero", () => {
    const result = replayPortfolioTransactions({
      portfolio,
      transactions: [{
        id: "sell",
        type: "sell",
        ticker: "ACHR",
        quantity: 1,
        fillPrice: 7.44,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
        oversellResolution: "close-to-zero",
        targetSharesAfter: 0,
      }],
    });
    expect(result.issues).toEqual([]);
    expect(result.ledger[0]).toMatchObject({
      kind: "qty",
      ticker: "ACHR",
      side: "sell",
      deltaShares: 1,
      sharesBefore: 1,
      sharesAfter: 0,
      untrackedClose: true,
    });
  });

  it("does not assign present-day strategies to imported history", () => {
    const result = replayPortfolioTransactions({
      portfolio: {
        ...portfolio,
        holdings: [{
          ticker: "XYZ",
          shares: 1,
          avgPrice: 10,
          openPnlPct: 0,
          conviction: 80,
          status: "Aligned",
          reason: "Current strategy state",
          strategyIds: ["strategy-now"],
        }],
      },
      transactions: [{
        id: "historical-buy",
        type: "buy",
        ticker: "XYZ",
        quantity: 1,
        fillPrice: 12,
        filledAt: "2026-01-01T15:00:00.000Z",
        timeZone: "UTC",
        source: "import",
      }],
    });
    expect(result.ledger[0]?.strategyIds).toEqual([]);
  });
});

describe("formatQuantity", () => {
  it("keeps six-decimal precision without displaying trailing zeros", () => {
    expect(formatQuantity(1.25)).toBe("1.25");
    expect(formatQuantity(0.1234564)).toBe("0.123456");
  });

  it("shows fractional edit values with at least five decimal places", () => {
    expect(formatFractionalQuantityInput(1)).toBe("1.00000");
    expect(formatFractionalQuantityInput(1.25)).toBe("1.25000");
    expect(formatFractionalQuantityInput(0.123456)).toBe("0.123456");
  });
});
