import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../migrations/20260727211500_reliable_cadence_scoring.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");

for (const [name, sql] of [
  ["migration", migration],
  ["schema", schema],
] as const) {
  describe(`${name} reliability contracts`, () => {
    it("persists subscriptions and rejects over-cap workspaces", () => {
      expect(sql).toContain("create table if not exists public.market_symbol_subscriptions");
      expect(sql).toContain("if symbol_count > 40 then");
      expect(sql).toContain("Market symbol subscription capacity exceeded");
      expect(sql).not.toMatch(/order by ticker\s+limit 40/);
      expect(sql).toContain("pg_advisory_xact_lock");
      expect(sql).toContain("if global_symbol_count > 800 then");
      expect(sql).toContain("Global market symbol subscription capacity exceeded");
    });

    it("keeps run claims idempotent and retries failed work after cooldown", () => {
      expect(sql).toContain(
        "unique (user_id, strategy_id, cadence, scheduled_for)",
      );
      expect(sql).toContain("on conflict (user_id, strategy_id, cadence, scheduled_for)");
      expect(sql).toContain(
        "run.completed_at < now() - interval '5 minutes'",
      );
      expect(sql).toContain(
        "run.claimed_at < now() - interval '10 minutes'",
      );
    });

    it("keeps recovery scheduled independently of Queue delivery", () => {
      expect(sql).toContain("create or replace function public.recover_due_conviction_cycles()");
      expect(sql).toContain("'*/5 * * * *'");
      expect(sql).toContain('body := \'{"recovery":true}\'::jsonb');
    });

    it("enforces own-row reads for normalized server state", () => {
      expect(sql).toContain("alter table public.strategy_check_runs enable row level security");
      expect(sql).toContain("using (auth.uid() = user_id)");
      expect(sql).toContain("to service_role");
    });

    it("persists exact combined scope and whole-book marks idempotently", () => {
      expect(sql).toContain(
        "create table if not exists public.strategy_check_combined_latest_results",
      );
      expect(sql).toContain("input_revision jsonb not null");
      expect(sql).toContain("Combined result strategy-set revision is stale");
      expect(sql).toMatch(/snapshot\.portfolio_id,\s+''/);
      expect(sql).toContain(
        "on conflict (user_id, portfolio_id, strategy_id, as_of) do update",
      );
    });

    it("records run provenance and deduplicates retry events", () => {
      expect(sql).toContain("forge_check_events_run_scope_kind_key");
      expect(sql).toContain("'runId', claimed.id");
      expect(sql).toContain(
        "on conflict (run_id, portfolio_id, ticker, kind)",
      );
      expect(sql).toContain("Strategy check run workspace revision is stale");
    });
  });
}
