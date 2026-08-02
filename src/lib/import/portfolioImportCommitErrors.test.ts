import { describe, expect, it, vi } from "vitest";
import {
  PortfolioImportCommitError,
  portfolioImportCommitErrorFromUnknown,
  portfolioImportCommitReassurance,
} from "./portfolioImportCommitErrors";

describe("portfolioImportCommitErrorFromUnknown", () => {
  it("maps each stable server code to the typed client taxonomy", () => {
    const cases: Array<[string, PortfolioImportCommitError["code"]]> = [
      ["portfolio_revision_conflict", "revision-conflict"],
      ["not_authenticated", "session-expired"],
      ["insufficient_cash", "insufficient-cash"],
      ["oversell", "oversell"],
      ["share_sequence_conflict", "oversell"],
      ["duplicate_transaction", "duplicate-transaction"],
      ["portfolio_cash_mismatch", "portfolio-cash-mismatch"],
      ["portfolio_holdings_mismatch", "holdings-mismatch"],
      ["portfolio_average_cost_mismatch", "average-cost-mismatch"],
      ["ticker_limit_exceeded", "ticker-limit"],
      ["invalid_batch", "invalid-batch"],
      ["invalid_transaction_count", "batch-too-large"],
      ["invalid_opening_boundary", "invalid-date-timezone"],
      ["historical_reconstruction_enqueue_failed", "reconstruction-enqueue-failed"],
    ];
    for (const [server, expected] of cases) {
      const error = portfolioImportCommitErrorFromUnknown({ message: server });
      expect(error.code).toBe(expected);
      expect(error.message).not.toMatch(/select |insert |raise |sql/i);
      expect(error.message).not.toContain(server.replaceAll("_", " "));
    }
  });

  it("keeps source-row association from safe DETAIL JSON", () => {
    const error = portfolioImportCommitErrorFromUnknown({
      message: "insufficient_cash",
      details: JSON.stringify({
        code: "insufficient_cash",
        sourceRow: 4,
        ticker: "CRM",
        requiredCash: 2482.5,
        availableCash: 0,
        password: "secret",
        sql: "select 1",
      }),
    });
    expect(error.code).toBe("insufficient-cash");
    expect(error.scope).toBe("row");
    expect(error.context.sourceRow).toBe(4);
    expect(error.context.ticker).toBe("CRM");
    expect(error.context.requiredCash).toBe(2482.5);
    expect(error.context.availableCash).toBe(0);
    expect(error.message).toContain("Row 4");
    expect(error.message).toContain("$0.00");
    expect(error.message).toContain("$2,482.50");
    expect(JSON.stringify(error.context)).not.toContain("secret");
    expect(JSON.stringify(error.context)).not.toContain("select 1");
  });

  it("treats preserve-mode cash math failures as schema-update-required", () => {
    const error = portfolioImportCommitErrorFromUnknown(
      { message: "invalid_trade_cash_math" },
      { cashTreatment: "preserve" },
    );
    expect(error.code).toBe("schema-update-required");
    expect(error.message).toContain("database update");
    expect(error.message).toContain("Your portfolio has not changed");
  });

  it("maps missing RPC / schema-cache failures specifically", () => {
    const error = portfolioImportCommitErrorFromUnknown({
      code: "PGRST202",
      message: "Could not find the function public.commit_portfolio_transaction_batch",
    });
    expect(error.code).toBe("schema-update-required");
  });

  it("never exposes raw unexpected database internals", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = portfolioImportCommitErrorFromUnknown({
      message: 'column "secret_column" of relation "user_state" does not exist',
      details: "Failing row contains (SELECT * FROM auth.users).",
    });
    expect(error.code).toBe("unexpected");
    expect(error.message).toBe(
      "The import could not be saved. Your portfolio has not changed. Retry in a moment.",
    );
    expect(error.message).not.toMatch(/imp-/);
    expect(error.message).not.toContain("secret_column");
    expect(error.message).not.toContain("auth.users");
    expect(error.context.referenceId).toMatch(/^imp-/);
    expect(portfolioImportCommitReassurance(error)).toBe("");
    expect(warn).toHaveBeenCalledWith(
      "portfolio import commit failed",
      expect.objectContaining({ code: "unexpected", referenceId: expect.any(String) }),
    );
    warn.mockRestore();
  });

  it("maps network failures without leaking fetch internals as the primary copy", () => {
    const error = portfolioImportCommitErrorFromUnknown({
      message: "TypeError: Failed to fetch",
    });
    expect(error.code).toBe("network-unavailable");
    expect(error.message).toContain("temporarily unavailable");
  });

  it("maps statement timeouts to an actionable split-batch message", () => {
    const error = portfolioImportCommitErrorFromUnknown({
      code: "57014",
      message: "canceling statement due to statement timeout",
    });
    expect(error.code).toBe("batch-too-large");
    expect(error.message).toContain("too large to save in one step");
    expect(error.message).toContain("under 100");
    expect(error.message).toContain("Your portfolio has not changed");
    expect(error.message).not.toMatch(/57014|canceling statement/i);
  });
});
