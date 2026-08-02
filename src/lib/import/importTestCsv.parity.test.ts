import { describe, expect, it } from "vitest";
import {
  replayPortfolioTransactions,
  roundUsd,
  type TradeCashTreatment,
} from "../finance/currentWatchTransactions";
import { normalizeImportRows } from "./portfolioImport";

/** Exact contents of the product-owner import-test.csv handoff fixture. */
const IMPORT_TEST_CSV = [
  "Transaction Type,Ticker,Quantity,Fill Price,Amount,Date / Time,Time Zone",
  "Deposit,,,,5000,07/30/2026 07:00:17,EST",
  "Buy,AAPL,10,312,,07/30/2026 18:31:17,EST",
  "Buy,NBIS,10,165.5,,07/30/2026 12:24:30,EST",
  "Buy,RGTI,20,14.85,,07/23/2026 08:52:57,EST",
  "Buy,CRM,15,165.50,,07/23/2026 08:52:17,EST",
].join("\n");

function loadFixtureRows(): string[][] {
  return IMPORT_TEST_CSV.split(/\r?\n/).map((line) => line.split(","));
}

/** Mirrors the server chronological cash replay for apply / preserve. */
function serverReplayCash(
  startingCash: number,
  ledger: ReturnType<typeof replayPortfolioTransactions>["ledger"],
  cashTreatment: TradeCashTreatment,
): {
  rejected?: { code: string; sourceRow?: number; available: number; required: number };
  finalCash: number;
} {
  let cash = roundUsd(startingCash);
  const ordered = [...ledger].sort(
    (left, right) =>
      Date.parse(left.filledAt) - Date.parse(right.filledAt) ||
      left.id.localeCompare(right.id),
  );
  for (const row of ordered) {
    const sourceRow = Number(row.id.match(/:row:(\d+)/)?.[1] ?? NaN);
    if (row.kind === "cash") {
      const expected = roundUsd(cash + row.deltaCash);
      if (expected < 0 || roundUsd(row.cashBefore) !== cash || roundUsd(row.cashAfter) !== expected) {
        return {
          rejected: {
            code: expected < 0 ? "insufficient_cash" : "invalid_cash_math",
            sourceRow: Number.isFinite(sourceRow) ? sourceRow : undefined,
            available: cash,
            required: Math.abs(row.deltaCash),
          },
          finalCash: cash,
        };
      }
      cash = expected;
      continue;
    }
    const tradeValue = roundUsd(row.deltaShares * row.fillPrice);
    const expected =
      cashTreatment === "preserve"
        ? cash
        : roundUsd(cash + (row.side === "sell" ? tradeValue : -tradeValue));
    if (cashTreatment === "apply" && expected < 0) {
      return {
        rejected: {
          code: "insufficient_cash",
          sourceRow: Number.isFinite(sourceRow) ? sourceRow : undefined,
          available: cash,
          required: tradeValue,
        },
        finalCash: cash,
      };
    }
    if (roundUsd(row.cashBefore ?? 0) !== cash || roundUsd(row.cashAfter ?? 0) !== expected) {
      return {
        rejected: {
          code: "invalid_trade_cash_math",
          sourceRow: Number.isFinite(sourceRow) ? sourceRow : undefined,
          available: cash,
          required: tradeValue,
        },
        finalCash: cash,
      };
    }
    cash = expected;
  }
  return { finalCash: cash };
}

describe("import-test.csv foundations", () => {
  it("normalizes to five retained rows with zero format errors", () => {
    const normalized = normalizeImportRows(loadFixtureRows(), {
      batchId: "import-test-fixture-001",
    });
    expect(normalized.transactions).toHaveLength(5);
    expect(normalized.issues).toHaveLength(0);
    expect(normalized.report.rowsRetained).toBe(5);
    expect(normalized.report.ignoredColumnCount).toBe(0);
    expect(normalized.report.invalidRowCount).toBe(0);
  });

  it("replays chronologically even when CSV rows are unordered", () => {
    const normalized = normalizeImportRows(loadFixtureRows(), {
      batchId: "import-test-fixture-002",
    });
    const preview = replayPortfolioTransactions({
      portfolio: {
        id: "p1",
        label: "Test",
        type: "portfolio",
        holdings: [],
        cashAvailable: 10_000,
      },
      transactions: normalized.transactions,
      tradeCashTreatment: "apply",
      markPrice: () => 0,
    });
    expect(preview.issues).toHaveLength(0);
    const order = preview.ledger.map((row) =>
      row.kind === "qty" ? `${row.side}:${row.ticker}` : row.deltaCash > 0 ? "deposit" : "withdrawal",
    );
    expect(order).toEqual([
      "buy:CRM",
      "buy:RGTI",
      "deposit",
      "buy:NBIS",
      "buy:AAPL",
    ]);
  });

  it("requires pre-existing cash before the July 23 purchases in apply mode", () => {
    const normalized = normalizeImportRows(loadFixtureRows(), {
      batchId: "import-test-fixture-003",
    });
    const july23Need = roundUsd(15 * 165.5 + 20 * 14.85);
    expect(july23Need).toBe(2779.5);

    const short = replayPortfolioTransactions({
      portfolio: {
        id: "p1",
        label: "Test",
        type: "portfolio",
        holdings: [],
        cashAvailable: 0,
      },
      transactions: normalized.transactions,
      tradeCashTreatment: "apply",
      markPrice: () => 0,
    });
    expect(short.issues.some((issue) => issue.code === "insufficient-cash")).toBe(true);
    // CSV row 6 = CRM (earliest Jul 23 purchase); row 5 = RGTI.
    expect(short.issues[0]?.sourceRow).toBe(6);

    const funded = replayPortfolioTransactions({
      portfolio: {
        id: "p1",
        label: "Test",
        type: "portfolio",
        holdings: [],
        cashAvailable: july23Need,
      },
      transactions: normalized.transactions,
      tradeCashTreatment: "apply",
      markPrice: () => 0,
    });
    expect(funded.issues).toHaveLength(0);
    expect(funded.portfolio.cashAvailable).toBe(roundUsd(july23Need + 5000 - 7554.5));
  });

  it("keeps apply-cash and preserve-current-cash modes distinct", () => {
    const normalized = normalizeImportRows(loadFixtureRows(), {
      batchId: "import-test-fixture-004",
    });
    const base = {
      id: "p1",
      label: "Test",
      type: "portfolio" as const,
      holdings: [],
      cashAvailable: 10_000,
    };
    const apply = replayPortfolioTransactions({
      portfolio: base,
      transactions: normalized.transactions,
      tradeCashTreatment: "apply",
      markPrice: () => 0,
    });
    const preserve = replayPortfolioTransactions({
      portfolio: base,
      transactions: normalized.transactions,
      tradeCashTreatment: "preserve",
      markPrice: () => 0,
    });
    expect(apply.issues).toHaveLength(0);
    expect(preserve.issues).toHaveLength(0);
    expect(apply.portfolio.cashAvailable).toBe(roundUsd(10_000 + 5000 - 7554.5));
    expect(preserve.portfolio.cashAvailable).toBe(roundUsd(10_000 + 5000));
    const firstBuy = preserve.ledger.find((row) => row.kind === "qty");
    expect(firstBuy?.kind).toBe("qty");
    if (firstBuy?.kind === "qty") {
      expect(firstBuy.cashBefore).toBe(firstBuy.cashAfter);
    }
  });

  it("agrees with server cash/share/average-cost math for apply and preserve", () => {
    const normalized = normalizeImportRows(loadFixtureRows(), {
      batchId: "import-test-fixture-005",
    });
    for (const treatment of ["apply", "preserve"] as const) {
      const preview = replayPortfolioTransactions({
        portfolio: {
          id: "p1",
          label: "Test",
          type: "portfolio",
          holdings: [],
          cashAvailable: 10_000,
        },
        transactions: normalized.transactions,
        tradeCashTreatment: treatment,
        markPrice: () => 0,
      });
      expect(preview.issues).toHaveLength(0);
      const server = serverReplayCash(10_000, preview.ledger, treatment);
      expect(server.rejected).toBeUndefined();
      expect(server.finalCash).toBe(preview.portfolio.cashAvailable);
      for (const holding of preview.portfolio.holdings) {
        expect(holding.shares).toBeGreaterThan(0);
        expect(holding.avgPrice).toBeGreaterThan(0);
      }
      expect(preview.portfolio.holdings.map((h) => h.ticker).sort()).toEqual([
        "AAPL",
        "CRM",
        "NBIS",
        "RGTI",
      ]);
    }
  });

  it("proves preserve ledgers fail against apply-only server math (current production)", () => {
    const normalized = normalizeImportRows(loadFixtureRows(), {
      batchId: "import-test-fixture-006",
    });
    const preserve = replayPortfolioTransactions({
      portfolio: {
        id: "p1",
        label: "Test",
        type: "portfolio",
        holdings: [],
        cashAvailable: 0,
      },
      transactions: normalized.transactions,
      tradeCashTreatment: "preserve",
      markPrice: () => 0,
    });
    expect(preserve.issues).toHaveLength(0);
    const againstLegacyServer = serverReplayCash(0, preserve.ledger, "apply");
    expect(againstLegacyServer.rejected?.code).toBe("insufficient_cash");
    expect(againstLegacyServer.rejected?.sourceRow).toBe(6);
    expect(againstLegacyServer.rejected?.required).toBe(2482.5);
  });
});
