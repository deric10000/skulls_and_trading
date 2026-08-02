import { createClient } from "@supabase/supabase-js";
import {
  requiredTickersForStrategyCheck,
  scoreCombinedAuthority,
  scoreStrategyCheck,
  type CompleteMarketCycle,
  type Workspace,
} from "../_shared/alignment.ts";
import { nextCheckBoundary } from "../_shared/cadence.ts";
import { runIsolatedBatch } from "../_shared/isolatedBatch.ts";
import {
  HISTORICAL_CHUNK_SIZE,
  reconstructHistoricalChunk,
  type HistoricalJob,
  type HistoricalStrategyEpisodeRow,
  type HistoricalStrategyVersionRow,
  type HistoricalTickerEpisodeRow,
  type HistoricalTransactionRow,
} from "../_shared/historicalReconstruction.ts";
import {
  classifyPreflightFailure,
  incompleteCycleTickers,
  missingCycleSymbols,
} from "../_shared/preflight.ts";
import type { CheckInterval } from "../../../src/types.ts";

interface CycleRequest {
  version?: unknown;
  cycleKey?: unknown;
  cycleAsOf?: unknown;
  recovery?: unknown;
  historicalOnly?: unknown;
}

async function fetchHistoricalCycle(
  at: string,
  symbols: string[],
  marketCycleUrl: string,
  secret: string,
): Promise<CompleteMarketCycle | null> {
  const configuredHistorical = Deno.env.get("HISTORICAL_MARKET_CYCLE_URL")?.trim();
  const url = configuredHistorical
    ? new URL(configuredHistorical)
    : new URL(marketCycleUrl.replace(/\/market-cycle(?:\?.*)?$/, "/historical-market-cycle"));
  url.searchParams.set("at", at);
  if (symbols.length > 0) url.searchParams.set("symbols", symbols.join(","));
  const response = await fetch(url, {
    headers: { "x-internal-scoring-secret": secret },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Historical market cycle fetch failed (${response.status})`);
  }
  const cycle: unknown = await response.json();
  if (!isCompleteCycle(cycle)) {
    throw new Error("Worker returned invalid historical market evidence");
  }
  if (Date.parse(cycle.cycleAsOf) > Date.parse(at)) {
    throw new Error("Historical market cycle is later than the transaction");
  }
  return cycle;
}

async function processHistoricalReconstruction(
  supabase: ReturnType<typeof createClient>,
  marketCycleUrl: string,
  secret: string,
): Promise<{ claimed: boolean; processed: number; hasMore: boolean }> {
  const { data: claimedRows, error: claimError } = await supabase.rpc(
    "claim_historical_reconstruction_job",
    { p_lease_seconds: 180 },
  );
  if (claimError) {
    if (claimError.code === "42883") return { claimed: false, processed: 0, hasMore: false };
    throw new Error(`Historical job claim failed: ${claimError.message}`);
  }
  const job = ((claimedRows ?? []) as HistoricalJob[])[0];
  if (!job) return { claimed: false, processed: 0, hasMore: false };
  try {
    const [chunkResponse, versionsResponse, applicationsResponse, tickerResponse] =
      await Promise.all([
        supabase.rpc("read_historical_reconstruction_chunk", {
          p_user_id: job.user_id,
          p_job_id: job.id,
          p_limit: HISTORICAL_CHUNK_SIZE + 1,
        }),
        supabase
          .from("strategy_versions")
          .select("id,strategy_id,effective_from,effective_to,snapshot")
          .eq("user_id", job.user_id)
          .lte("effective_from", job.score_window_end)
          .or(`effective_to.is.null,effective_to.gte.${job.score_window_start}`),
        supabase
          .from("strategy_portfolio_application_episodes")
          .select("strategy_id,portfolio_id,applied_at,removed_at")
          .eq("user_id", job.user_id)
          .eq("portfolio_id", job.portfolio_id)
          .lte("applied_at", job.score_window_end)
          .or(`removed_at.is.null,removed_at.gte.${job.score_window_start}`),
        supabase
          .from("strategy_ticker_application_episodes")
          .select("strategy_id,portfolio_id,ticker,applied_at,removed_at")
          .eq("user_id", job.user_id)
          .eq("portfolio_id", job.portfolio_id)
          .lte("applied_at", job.score_window_end)
          .or(`removed_at.is.null,removed_at.gte.${job.score_window_start}`),
      ]);
    for (const response of [chunkResponse, versionsResponse, applicationsResponse, tickerResponse]) {
      if (response.error) throw new Error(response.error.message);
    }
    const fetched = (chunkResponse.data ?? []) as HistoricalTransactionRow[];
    const hasMore = fetched.length > HISTORICAL_CHUNK_SIZE;
    const transactions = fetched.slice(0, HISTORICAL_CHUNK_SIZE);
    const cycleCache = new Map<string, Promise<CompleteMarketCycle | null>>();
    const cachedHistoricalCycle = (at: string, symbols: string[]) => {
      const hour = new Date(
        Math.floor(Date.parse(at) / 3_600_000) * 3_600_000,
      ).toISOString();
      const key = `${hour}|${symbols.join(",")}`;
      let pending = cycleCache.get(key);
      if (!pending) {
        pending = fetchHistoricalCycle(at, symbols, marketCycleUrl, secret);
        cycleCache.set(key, pending);
      }
      return pending;
    };
    const rebuilt = await reconstructHistoricalChunk({
      job,
      transactions,
      versions: (versionsResponse.data ?? []) as HistoricalStrategyVersionRow[],
      applications: (applicationsResponse.data ?? []) as HistoricalStrategyEpisodeRow[],
      tickerApplications: (tickerResponse.data ?? []) as HistoricalTickerEpisodeRow[],
      fetchCycle: cachedHistoricalCycle,
    });
    const { error: completeError } = await supabase.rpc(
      "complete_historical_reconstruction_chunk",
      {
        p_user_id: job.user_id,
        p_job_id: job.id,
        p_results: rebuilt.results,
        p_working_portfolio: rebuilt.workingPortfolio,
        p_has_more: hasMore,
      },
    );
    if (completeError) throw new Error(completeError.message);
    console.log(JSON.stringify({
      event: "historical_reconstruction_chunk",
      jobId: job.id,
      processed: rebuilt.results.length,
      hasMore,
      outcome: "complete",
    }));
    return { claimed: true, processed: rebuilt.results.length, hasMore };
  } catch (error) {
    const category = error instanceof Error && error.message.includes("market cycle")
      ? "market_cycle_fetch"
      : "processing_failure";
    const { error: retryError } = await supabase.rpc(
      "retry_historical_reconstruction_job",
      {
      p_user_id: job.user_id,
      p_job_id: job.id,
      p_error_category: category,
      },
    );
    console.error(JSON.stringify({
      event: "historical_reconstruction_chunk",
      jobId: job.id,
      outcome: "retrying",
      category,
      retryRecorded: retryError == null,
    }));
    return { claimed: true, processed: 0, hasMore: true };
  }
}

interface ClaimedRun {
  run_id: string;
  user_id: string;
  strategy_id: string;
  cadence: CheckInterval;
  scheduled_for: string;
  definition_hash: string;
  workspace_updated_at: string;
  scoring_revision?: string | null;
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
    const historicalOnly = body.historicalOnly === true;
    const validReference =
      body.version === 1 &&
      typeof body.cycleKey === "string" &&
      body.cycleKey.startsWith(CYCLE_KEY_PREFIX) &&
      typeof body.cycleAsOf === "string" &&
      !Number.isNaN(Date.parse(body.cycleAsOf));
    if (!historicalOnly && !isRecovery && !validReference) {
      return json({ error: "Invalid cycle reference" }, 400);
    }

    const supabase = createClient(
      configured("SUPABASE_URL"),
      configured("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const marketCycleUrl = configured("MARKET_CYCLE_URL");
    if (historicalOnly) {
      const historical = await processHistoricalReconstruction(
        supabase,
        marketCycleUrl,
        secret,
      );
      return json({ ok: true, historical });
    }
    // Historical work has its own recovery cadence. Keeping it out of live
    // cycle requests prevents a large import from delaying conviction checks.
    const historical = { claimed: false, processed: 0, hasMore: false };
    const cycle = await fetchCycle(body, marketCycleUrl, secret);

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
            .select("portfolios,strategies,share_fills,updated_at,scoring_revision")
            .eq("user_id", run.user_id)
            .single();
          if (workspaceError) {
            throw new Error(`Workspace read failed: ${workspaceError.message}`);
          }
          const currentScoringRevision =
            typeof workspace.scoring_revision === "string" &&
            workspace.scoring_revision.length > 0
              ? workspace.scoring_revision
              : null;
          if (
            run.scoring_revision &&
            currentScoringRevision &&
            run.scoring_revision !== currentScoringRevision
          ) {
            throw new Error(
              JSON.stringify({
                softFail: true,
                status: "superseded",
                category: "workspace_superseded",
                affected: [],
                message: "scoring_revision_mismatch",
              }),
            );
          }
          // Legacy runs without scoring_revision: keep updated_at gate.
          if (
            !run.scoring_revision &&
            (typeof workspace.updated_at !== "string" ||
              Date.parse(workspace.updated_at) !==
                Date.parse(run.workspace_updated_at))
          ) {
            throw new Error(
              JSON.stringify({
                softFail: true,
                status: "superseded",
                category: "workspace_superseded",
                affected: [],
                message: "workspace_superseded",
              }),
            );
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
          const strategy = typedWorkspace.strategies.find(
            (item) => item.id === run.strategy_id,
          );
          const requiredTickers = strategy
            ? requiredTickersForStrategyCheck(typedWorkspace, strategy)
            : [];
          const preflight = classifyPreflightFailure({
            missingFromCycle: missingCycleSymbols(requiredTickers, cycle),
            incompleteTickers: incompleteCycleTickers(requiredTickers, cycle),
            hasContext: cycle.context != null,
          });
          if (preflight) {
            const exhausted = run.attempt_count >= 5;
            const err = new Error(
              JSON.stringify({
                softFail: true,
                status: exhausted ? "failed" : preflight.status,
                category: exhausted ? "retry_exhausted" : preflight.category,
                affected: preflight.affected,
                message: preflight.message,
              }),
            );
            throw err;
          }
          const individual = scoreStrategyCheck(
            typedWorkspace,
            run.strategy_id,
            run.cadence,
            cycle,
          );
          const combinedKey =
            `${run.user_id}|${run.scoring_revision ?? run.workspace_updated_at}|${cycle.cycleKey}`;
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
                strategy_ids: [...result.strategy_ids].sort(),
                input_revision: scopeRevision(
                  [...result.strategy_ids].sort(),
                  schedules,
                ),
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
          let status = "failed";
          let category = "unknown";
          let affected: string[] = [];
          let errorText = message;
          try {
            const parsed = JSON.parse(message) as {
              softFail?: boolean;
              status?: string;
              category?: string;
              affected?: string[];
              message?: string;
            };
            if (parsed.softFail) {
              status = parsed.status ?? "failed";
              category = parsed.category ?? "unknown";
              affected = parsed.affected ?? [];
              errorText = parsed.message ?? message;
            }
          } catch {
            if (message.includes("revision")) {
              category = "scoring_revision_mismatch";
            }
          }
          const { error: failError } = await supabase.rpc(
            "fail_strategy_check_run",
            {
              p_run_id: run.run_id,
              p_error: errorText,
              p_error_category: category,
              p_affected_tickers: affected,
              p_status: status,
              p_next_retry_at:
                status === "failed" || status === "superseded"
                  ? null
                  : new Date(Date.now() + 5 * 60_000).toISOString(),
            },
          );
          if (failError) {
            const { error: legacyFail } = await supabase.rpc(
              "fail_strategy_check_run",
              {
                p_run_id: run.run_id,
                p_error: errorText,
              },
            );
            if (legacyFail) throw new Error(legacyFail.message);
          }
          console.error(
            JSON.stringify({
              event: "conviction_run",
              runId: run.run_id,
              strategyId: run.strategy_id,
              outcome: status,
              error: errorText,
              category,
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
      { ok: failed === 0, cycleKey: cycle.cycleKey, completed, failed, historical },
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
