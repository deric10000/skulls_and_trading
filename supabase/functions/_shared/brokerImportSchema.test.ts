import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../migrations/20260802001000_broker_import_cash_treatment.sql",
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
    expect(migration.match(/ticker_limit_exceeded/g)).toHaveLength(1);
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
});
