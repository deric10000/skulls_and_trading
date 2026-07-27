import { createClient } from "@supabase/supabase-js";
import {
  scoreCombinedAuthority,
  scoreStrategyCheck,
  type CompleteMarketCycle,
  type Workspace,
} from "../_shared/alignment.ts";
import { nextCheckBoundary } from "../_shared/cadence.ts";
import { runIsolatedBatch } from "../_shared/isolatedBatch.ts";
import type { CheckInterval } from "../../../src/types.ts";

interface CycleRequest {
  version?: unknown;
  cycleKey?: unknown;
  cycleAsOf?: unknown;
  recovery?: unknown;
}

interface ClaimedRun {
  run_id: string;
  user_id: string;
  strategy_id: string;
  cadence: CheckInterval;
  scheduled_for: string;
  definition_hash: string;
  workspace_updated_at: string;
  attempt_count: number;
}

interface ScheduleRevision {
  strategy_id: string;
  definition_hash: string;
}

function scopeRevision(
  strategyIds: string[],
  schedules: ScheduleRevision[],
): Record<string, string[]> {
  return Object.fromEntries(
    [...strategyIds].sort().map((strategyId) => [
      strategyId,
      [...new Set(
        schedules
          .filter((row) => row.strategy_id === strategyId)
          .map((row) => row.definition_hash),
      )].sort(),
    ]),
  );
}

const CYCLE_KEY_PREFIX = "market:cycle:complete:";
const MAX_CLAIM_PAGES = 20;
const CLAIM_PAGE_SIZE = 25;
const RUN_CONCURRENCY = 4;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

async function secretEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

function configured(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isCompleteCycle(value: unknown): value is CompleteMarketCycle {
  if (!value || typeof value !== "object") return false;
  const cycle = value as Partial<CompleteMarketCycle>;
  return (
    cycle.schemaVersion === 1 &&
    cycle.complete === true &&
    typeof cycle.cycleKey === "string" &&
    cycle.cycleKey.startsWith(CYCLE_KEY_PREFIX) &&
    typeof cycle.cycleAsOf === "string" &&
    !Number.isNaN(Date.parse(cycle.cycleAsOf)) &&
    cycle.quotes != null &&
    cycle.fundamentals != null &&
    cycle.technicals != null &&
    cycle.byTimeframe != null &&
    cycle.context != null
  );
}

async function fetchCycle(
  request: CycleRequest,
  marketCycleUrl: string,
  secret: string,
): Promise<CompleteMarketCycle> {
  const cycleKey =
    typeof request.cycleKey === "string" &&
    request.cycleKey.startsWith(CYCLE_KEY_PREFIX)
      ? request.cycleKey
      : null;
  const url = new URL(marketCycleUrl);
  if (cycleKey) url.searchParams.set("key", cycleKey);
  const response = await fetch(url, {
    headers: { "x-internal-scoring-secret": secret },
  });
  if (!response.ok) {
    throw new Error(`Complete market cycle fetch failed (${response.status})`);
  }
  const cycle: unknown = await response.json();
  if (!isCompleteCycle(cycle)) {
    throw new Error("Worker returned an incomplete market cycle");
  }
  if (cycleKey && cycle.cycleKey !== cycleKey) {
    throw new Error("Market cycle reference mismatch");
  }
  if (
    typeof request.cycleAsOf === "string" &&
    cycle.cycleAsOf !== request.cycleAsOf
  ) {
    throw new Error("Market cycle timestamp mismatch");
  }
  return cycle;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const batchStartedAt = performance.now();
    const secret = configured("INTERNAL_SCORING_SECRET");
    const supplied =
      request.headers.get("x-internal-scoring-secret")?.trim() ?? "";
    if (!(await secretEqual(supplied, secret))) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: CycleRequest;
    try {
      body = (await request.json()) as CycleRequest;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const isRecovery = body.recovery === true;
    const validReference =
      body.version === 1 &&
      typeof body.cycleKey === "string" &&
      body.cycleKey.startsWith(CYCLE_KEY_PREFIX) &&
      typeof body.cycleAsOf === "string" &&
      !Number.isNaN(Date.parse(body.cycleAsOf));
    if (!isRecovery && !validReference) {
      return json({ error: "Invalid cycle reference" }, 400);
    }

    const supabase = createClient(
      configured("SUPABASE_URL"),
      configured("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const cycle = await fetchCycle(
      body,
      configured("MARKET_CYCLE_URL"),
      secret,
    );

    let completed = 0;
    let failed = 0;
    let lateChecks = 0;
    const combinedByWorkspaceCycle = new Map<
      string,
      ReturnType<typeof scoreCombinedAuthority>
    >();
    if (isRecovery) {
      console.warn(
        JSON.stringify({
          event: "conviction_cycle_recovery",
          outcome: "started",
        }),
      );
    }
    for (let page = 0; page < MAX_CLAIM_PAGES; page += 1) {
      const { data, error } = await supabase.rpc(
        "claim_due_strategy_check_runs",
        {
          p_cycle_as_of: cycle.cycleAsOf,
          p_cycle_key: cycle.cycleKey,
          p_limit: CLAIM_PAGE_SIZE,
        },
      );
      if (error) throw new Error(`Run claim failed: ${error.message}`);
      const runs = (data ?? []) as ClaimedRun[];
      if (runs.length === 0) break;

      const outcomes = await runIsolatedBatch(
        runs,
        RUN_CONCURRENCY,
        async (run) => {
          const lateByMs = Math.max(
            0,
            Date.parse(cycle.cycleAsOf) - Date.parse(run.scheduled_for),
          );
          if (lateByMs >= 60 * 60_000) {
            lateChecks += 1;
            console.warn(
              JSON.stringify({
                event: "conviction_check_late",
                runId: run.run_id,
                strategyId: run.strategy_id,
                scheduledFor: run.scheduled_for,
                cycleAsOf: cycle.cycleAsOf,
                lateByMs,
              }),
            );
          }
          if (run.attempt_count > 1) {
            console.warn(
              JSON.stringify({
                event: "conviction_run_retry",
                runId: run.run_id,
                attempt: run.attempt_count,
                recovery: isRecovery,
              }),
            );
          }
          const { data: workspace, error: workspaceError } = await supabase
            .from("user_state")
            .select("portfolios,strategies,share_fills,updated_at")
            .eq("user_id", run.user_id)
            .single();
          if (workspaceError) {
            throw new Error(`Workspace read failed: ${workspaceError.message}`);
          }
          if (
            typeof workspace.updated_at !== "string" ||
            Date.parse(workspace.updated_at) !== Date.parse(run.workspace_updated_at)
          ) {
            throw new Error("Claimed workspace revision changed before scoring");
          }
          const { data: scheduleRows, error: schedulesError } = await supabase
            .from("strategy_check_schedules")
            .select("strategy_id,definition_hash")
            .eq("user_id", run.user_id);
          if (schedulesError) {
            throw new Error(`Schedule read failed: ${schedulesError.message}`);
          }
          const schedules = (scheduleRows ?? []) as ScheduleRevision[];
          const typedWorkspace = workspace as Workspace;
          const individual = scoreStrategyCheck(
            typedWorkspace,
            run.strategy_id,
            run.cadence,
            cycle,
          );
          const combinedKey =
            `${run.user_id}|${run.workspace_updated_at}|${cycle.cycleKey}`;
          let combined = combinedByWorkspaceCycle.get(combinedKey);
          if (!combined) {
            combined = scoreCombinedAuthority(typedWorkspace, cycle);
            combinedByWorkspaceCycle.set(combinedKey, combined);
          }
          const output = {
            ...individual,
            combinedResults: combined.combinedResults.filter((result) =>
              result.strategy_ids.includes(run.strategy_id)
            ),
            wholeBookSnapshots: combined.wholeBookSnapshots,
          };
          const nextDueAt = nextCheckBoundary(run.cadence, cycle.cycleAsOf);
          const { error: completeError } = await supabase.rpc(
            "complete_strategy_check_run",
            {
              p_run_id: run.run_id,
              p_next_due_at: nextDueAt,
              p_results: output.results,
              p_portfolio_snapshots: output.portfolioSnapshots,
              p_combined_results: output.combinedResults.map((result) => ({
                ...result,
                input_revision: scopeRevision(result.strategy_ids, schedules),
              })),
              p_whole_book_snapshots: output.wholeBookSnapshots,
              p_events: output.events,
            },
          );
          if (completeError) {
            throw new Error(`Run completion failed: ${completeError.message}`);
          }
        },
        async (run, message) => {
          const { error: failError } = await supabase.rpc(
            "fail_strategy_check_run",
            {
              p_run_id: run.run_id,
              p_error: message,
            },
          );
          if (failError) {
            throw new Error(failError.message);
          }
          console.error(
            JSON.stringify({
              event: "conviction_run",
              runId: run.run_id,
              strategyId: run.strategy_id,
              outcome: "failed",
              error: message,
            }),
          );
        },
      );
      completed += outcomes.filter((outcome) => outcome.ok).length;
      failed += outcomes.filter((outcome) => !outcome.ok).length;
      if (runs.length < CLAIM_PAGE_SIZE) break;
    }

    console.log(
      JSON.stringify({
        event: "conviction_cycle",
        cycleKey: cycle.cycleKey,
        completed,
        failed,
        lateChecks,
        recovery: isRecovery,
        batchDurationMs: Number((performance.now() - batchStartedAt).toFixed(2)),
      }),
    );
    return json(
      { ok: failed === 0, cycleKey: cycle.cycleKey, completed, failed },
      failed === 0 ? 200 : 503,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown conviction cycle error";
    console.error(
      JSON.stringify({ event: "conviction_cycle", outcome: "failed", error: message }),
    );
    return json({ error: message }, 500);
  }
});
