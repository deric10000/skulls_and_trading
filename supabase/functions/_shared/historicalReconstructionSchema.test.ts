import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../migrations/20260801213000_historical_reconstruction.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("historical reconstruction schema contract", () => {
  it("leases resumable jobs and keeps derived writes service-only", () => {
    expect(migration).toContain("create table if not exists public.historical_reconstruction_jobs");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("historical_job_lease_lost");
    expect(migration).toContain("historical_chunk_count_mismatch");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("revoke insert, update, delete");
  });

  it("captures durable strategy and ticker assignment boundaries", () => {
    expect(migration).toContain("capture_workspace_history_after_write");
    expect(migration).toContain("strategy_ticker_application_episodes");
    expect(migration).toContain("version_row.effective_from + interval '1 microsecond'");
    expect(migration).toContain("We never backdate these snapshots");
  });

  it("enqueues imports atomically and processes them independently every two minutes", () => {
    expect(migration).toContain("enqueue_historical_reconstruction_after_import");
    expect(migration).toContain("recover-historical-reconstruction");
    expect(migration).toContain("'*/2 * * * *'");
    expect(migration).toContain('"historicalOnly":true');
  });

  it("routes backdated manual rows through the same evidence boundary", () => {
    expect(migration).toContain("enqueue_manual_historical_reconstruction");
    expect(migration).toContain("now() - interval '15 minutes'");
    expect(migration).toContain("reconstruction_status = 'pending'");
    expect(migration).toContain("job.transaction_ids ? tx.id");
  });
});
