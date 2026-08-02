import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../auth/supabaseClient", () => ({
  getSupabase: () => ({ rpc }),
}));

vi.mock("./workspaceMutationQueue", () => ({
  serializeWorkspaceMutation: async (
    _userId: string,
    work: () => Promise<unknown>,
  ) => work(),
}));

import { PortfolioImportCommitError } from "../import/portfolioImportCommitErrors";
import { commitPortfolioTransactionBatch } from "./portfolioLedger";

describe("commitPortfolioTransactionBatch error contract", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("surfaces typed revision conflicts without a generic failure", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "portfolio_revision_conflict" },
    });
    await expect(
      commitPortfolioTransactionBatch(
        {
          portfolioId: "p1",
          expectedRevision: 1,
          portfolio: {
            id: "p1",
            label: "Test",
            type: "portfolio",
            holdings: [],
            cashAvailable: 0,
            revision: 2,
          },
          transactions: [],
          batch: {
            id: "import-aaaaaaaa",
            mode: "append",
            cashTreatment: "apply",
            report: {
              rowsReceived: 1,
              rowsRetained: 1,
              rowsSkipped: 0,
              ignoredColumnCount: 0,
              invalidRowCount: 0,
              normalizedCellCount: 0,
              fractionalRowCount: 0,
              ambiguousTimeZoneCount: 0,
              distinctTickerCount: 0,
            },
          },
        },
        "user-1",
      ),
    ).rejects.toMatchObject({ code: "revision-conflict" });
  });

  it("maps preserve-mode cash rejects to schema-update-required", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "invalid_trade_cash_math" },
    });
    try {
      await commitPortfolioTransactionBatch(
        {
          portfolioId: "p1",
          expectedRevision: 0,
          portfolio: {
            id: "p1",
            label: "Test",
            type: "portfolio",
            holdings: [],
            cashAvailable: 5000,
            revision: 1,
          },
          transactions: [],
          batch: {
            id: "import-bbbbbbbb",
            mode: "append",
            cashTreatment: "preserve",
            report: {
              rowsReceived: 5,
              rowsRetained: 5,
              rowsSkipped: 0,
              ignoredColumnCount: 0,
              invalidRowCount: 0,
              normalizedCellCount: 0,
              fractionalRowCount: 0,
              ambiguousTimeZoneCount: 0,
              distinctTickerCount: 4,
            },
          },
        },
        "user-1",
      );
      expect.unreachable("expected typed failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PortfolioImportCommitError);
      expect((error as PortfolioImportCommitError).code).toBe(
        "schema-update-required",
      );
      expect((error as PortfolioImportCommitError).message).not.toContain(
        "invalid_trade_cash_math",
      );
    }
  });

  it("keeps row context from server DETAIL for insufficient cash", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: "insufficient_cash",
        details: JSON.stringify({
          code: "insufficient_cash",
          sourceRow: 6,
          ticker: "CRM",
          requiredCash: 2482.5,
          availableCash: 0,
        }),
      },
    });
    await expect(
      commitPortfolioTransactionBatch(
        {
          portfolioId: "p1",
          expectedRevision: 0,
          portfolio: {
            id: "p1",
            label: "Test",
            type: "portfolio",
            holdings: [],
            cashAvailable: 0,
            revision: 1,
          },
          transactions: [],
          batch: {
            id: "import-cccccccc",
            mode: "append",
            cashTreatment: "apply",
            report: {
              rowsReceived: 5,
              rowsRetained: 5,
              rowsSkipped: 0,
              ignoredColumnCount: 0,
              invalidRowCount: 0,
              normalizedCellCount: 0,
              fractionalRowCount: 0,
              ambiguousTimeZoneCount: 0,
              distinctTickerCount: 4,
            },
          },
        },
        "user-1",
      ),
    ).rejects.toMatchObject({
      code: "insufficient-cash",
      context: { sourceRow: 6, ticker: "CRM" },
    });
  });
});
