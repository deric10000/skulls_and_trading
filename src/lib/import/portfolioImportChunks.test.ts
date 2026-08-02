import { describe, expect, it } from "vitest";
import type { DraftPortfolioTransaction } from "../finance/currentWatchTransactions";
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_IN_APP_ROW_CAP,
  chunkActionLabel,
  inAppEligibleDrafts,
  importUniverseForChunking,
  nextImportChunk,
  orderDraftTransactionsForImport,
  preparedProgressCopy,
  rebatchDraftForCommit,
  rebatchLedgerForCommit,
  remainingDraftsById,
  resultingActiveTickerCount,
  usesChunkedAppendImport,
} from "./portfolioImportChunks";

function draft(
  id: string,
  filledAt: string,
  sourceRow: number,
): DraftPortfolioTransaction {
  return {
    id,
    type: "buy",
    ticker: "AAA",
    quantity: 1,
    fillPrice: 1,
    filledAt,
    timeZone: "America/New_York",
    source: "import",
    sourceRow,
  };
}

describe("portfolioImportChunks", () => {
  it("orders by filledAt then sourceRow", () => {
    const rows = [
      draft("b", "2026-01-02T15:00:00.000Z", 2),
      draft("a", "2026-01-01T15:00:00.000Z", 9),
      draft("c", "2026-01-02T15:00:00.000Z", 1),
    ];
    expect(orderDraftTransactionsForImport(rows).map((row) => row.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("caps in-app eligibility at 300 and slices the next chunk of 100", () => {
    const rows = Array.from({ length: 350 }, (_, index) =>
      draft(
        `r${index}`,
        new Date(Date.UTC(2020, 0, 1 + Math.floor(index / 5), index % 24)).toISOString(),
        index + 1,
      ),
    );
    expect(inAppEligibleDrafts(rows).length).toBe(IMPORT_IN_APP_ROW_CAP);
    const first = nextImportChunk(rows, 0, 0);
    expect(first.chunk.length).toBe(IMPORT_CHUNK_SIZE);
    expect(first.inAppTotal).toBe(IMPORT_IN_APP_ROW_CAP);
    expect(first.canImportMore).toBe(true);
    const second = nextImportChunk(rows, 100, 1);
    expect(second.chunk.map((row) => row.id)[0]).toBe("r100");
    expect(second.chunk.length).toBe(100);
    const third = nextImportChunk(rows, 200, 2);
    expect(third.chunk.length).toBe(100);
    const done = nextImportChunk(rows, 300, 3);
    expect(done.canImportMore).toBe(false);
    expect(done.chunk).toEqual([]);
  });

  it("labels a short final chunk as remaining N", () => {
    const rows = Array.from({ length: 293 }, (_, index) =>
      draft(`r${index}`, `2026-01-01T${String(index % 24).padStart(2, "0")}:00:00.000Z`, index + 1),
    );
    // Force unique timestamps for stable order.
    const unique = rows.map((row, index) => ({
      ...row,
      filledAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
    }));
    const last = nextImportChunk(unique, 200, 2);
    expect(last.chunk.length).toBe(93);
    expect(chunkActionLabel(last.chunk.length)).toBe("Import remaining 93");
    expect(preparedProgressCopy({
      preparedCount: 200,
      retainedCount: 293,
      inAppTotal: 293,
    })).toBe("200 of 293 rows ready");
    expect(preparedProgressCopy({
      preparedCount: 100,
      retainedCount: 350,
      inAppTotal: 300,
    })).toBe("100 of first 300 in-app rows ready");
  });

  it("rebaches draft and ledger ids to the commit batch identity", () => {
    const draft = rebatchDraftForCommit(
      {
        id: "import-old:row:371",
        type: "sell",
        ticker: "GOOG",
        quantity: 1,
        fillPrice: 1,
        filledAt: "2026-01-01T00:00:00.000Z",
        timeZone: "America/New_York",
        source: "import",
        sourceRow: 371,
        importBatchId: "import-old",
      },
      "import-new",
    );
    expect(draft.id).toBe("import-new:row:371");
    expect(draft.importBatchId).toBe("import-new");
    expect(
      rebatchLedgerForCommit(
        [
          {
            id: "import-old:row:371",
            kind: "qty",
            portfolioId: "p1",
            ticker: "GOOG",
            side: "sell",
            deltaShares: 1,
            sharesBefore: 0,
            sharesAfter: 0,
            fillPrice: 1,
            filledAt: "2026-01-01T00:00:00.000Z",
            source: "import",
            actionClass: "trim",
            strategyIds: [],
            importBatchId: "import-old",
            fingerprint: "fp",
            timeZone: "America/New_York",
          },
        ],
        "import-new",
      )[0]?.id,
    ).toBe("import-new:row:371");
  });

  it("enables chunked append only above the 100-row threshold", () => {
    expect(usesChunkedAppendImport("append", 100)).toBe(false);
    expect(usesChunkedAppendImport("append", 101)).toBe(true);
    expect(usesChunkedAppendImport("replace", 293)).toBe(false);
  });

  it("keeps chunk remaining-by-id aligned when earlier flagged rows are suppressed", () => {
    const rows = Array.from({ length: 105 }, (_, index) =>
      draft(
        `r${index}`,
        new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
        index + 1,
      ),
    );
    const suppressed = new Set(["r0"]);
    const universe = importUniverseForChunking(rows, suppressed);
    expect(universe).toHaveLength(104);
    expect(universe[0]?.id).toBe("r1");
    const first = nextImportChunk(universe, 0, 0);
    expect(first.chunk).toHaveLength(100);
    expect(first.chunk[0]?.id).toBe("r1");
    expect(first.chunk[99]?.id).toBe("r100");
    const stagedIds = new Set(first.chunk.map((row) => row.id));
    const remaining = remainingDraftsById(universe, stagedIds);
    expect(remaining.map((row) => row.id)).toEqual(["r101", "r102", "r103", "r104"]);
    const inAppTotal = Math.min(universe.length, IMPORT_IN_APP_ROW_CAP);
    expect(stagedIds.size + remaining.length).toBe(inAppTotal);
  });

  it("counts only shares > 0 across workspace for ticker limit", () => {
    expect(
      resultingActiveTickerCount({
        portfolioId: "p1",
        otherPortfolioActiveTickers: ["AAPL", "MSFT", "aapl"],
        resultingHoldings: [
          { ticker: "NVDA", shares: 1 },
          { ticker: "SOFI", shares: 0 },
          { ticker: "MSFT", shares: 2 },
        ],
      }),
    ).toBe(3);
  });
});
