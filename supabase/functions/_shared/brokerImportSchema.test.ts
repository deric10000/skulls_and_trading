import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../migrations/20260802001000_broker_import_cash_treatment.sql",
    import.meta.url,
  ),
  "utf8",
);

const ambiguityFix = readFileSync(
  new URL(
    "../../migrations/20260802013000_fix_import_commit_tx_ambiguity.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("broker import persistence migration", () => {
  it("keeps old clients on normal cash accounting", () => {
    expect(migration).toContain(
      "coalesce(nullif(p_batch->>'cashTreatment', ''), 'apply')",
    );
  });

  it("avoids PL/pgSQL alias collision on the transaction insert", () => {
    expect(ambiguityFix).toContain(
      "from jsonb_array_elements(p_transactions) as tx_row;",
    );
    expect(ambiguityFix).toContain("tx_row->>'id'");
    expect(ambiguityFix).not.toContain(
      "from jsonb_array_elements(p_transactions) tx;",
    );
  });

  it("allows import untrackedClose sells when brokerage lots were never accounted", () => {
    const untracked = readFileSync(
      new URL(
        "../../migrations/20260802020000_import_untracked_close.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(untracked).toContain("untrackedClose");
    expect(untracked).toContain("trust the client sequence");
  });

  it("allows cash preservation only for additive imports", () => {
    expect(migration).toContain(
      "cash_treatment = 'preserve' and batch_mode <> 'append'",
    );
    expect(migration).toContain(
      "expected_cash := case when cash_treatment = 'preserve'",
    );
  });

  it("gates the final active universe instead of all historical symbols", () => {
    expect(migration).toContain(
      "Historical symbols may exceed the live market-data budget",
    );
    expect(migration.match(/ticker_limit_exceeded/g)?.length).toBeGreaterThanOrEqual(1);
    expect(migration).toContain(
      "jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb))",
    );
  });

  it("persists only the cash-treatment enum and sanitized counts", () => {
    expect(migration).toContain("'rowsSkipped'");
    expect(migration).toContain("'cashTreatment', cash_treatment");
    expect(migration).not.toContain("detectedFormat");
    expect(migration).not.toContain("filename");
  });

  it("raises stable import error codes with safe JSON detail", () => {
    expect(migration).toContain("raise_portfolio_import_error");
    expect(migration).toContain("insufficient_cash");
    expect(migration).toContain("stale_cash_sequence");
    expect(migration).toContain("historical_reconstruction_enqueue_failed");
    expect(migration).toContain("'sourceRow'");
    expect(migration).toContain("hint = 'portfolio_import_error'");
  });
});
