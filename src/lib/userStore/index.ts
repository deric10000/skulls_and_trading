import type {
  CaptainProfile,
  CheckInterval,
  LogEntry,
  Portfolio,
  PortfolioTransaction,
  RuleChip,
  ResolvedStatus,
  Strategy,
  WatchlistItem,
} from "../../types";
import { CHIP_LIBRARY_SEED, DEFAULT_CAPTAIN, DEFAULT_STRATEGIES } from "../../data";
import { getSupabase } from "../auth/supabaseClient";
import { normalizePortfolioTransactions } from "../finance/portfolioTransactions";
import { measureAsync, perfValue } from "../performance/marks";
import { mergeStrategiesForHydrate } from "./strategyMerge";

export const WORKSPACE_PAYLOAD_BUDGET_BYTES = 256 * 1024;
const workspaceWriteChains = new Map<string, Promise<void>>();

/** One-shot per-user UI markers (persisted in user_state.flags). */
export interface UserFlags {
  /** True once the first-login Onboarding modal has been dismissed. */
  onboardingSeen?: boolean;
  /**
   * Onboarding badge IDs that already fired their congratulations toast
   * (or were silently backfilled for milestones already true at hydrate).
   * Earn display still derives from live portfolios/strategies / weather visits.
   */
  badgeToastsSeen?: string[];
  /**
   * Market Weather layers the Captain has opened in detail (card click).
   * Drives the Weather Reader onboarding badge when all four are present.
   */
  weatherReaderLayers?: Array<"market" | "sector" | "industry" | "stock">;
  /** Last successful real strategy-check boundary, shared across clients. */
  lastDataPullAtByStrategyId?: Record<string, string>;
  /**
   * Tickers waiting on a check after add/enable. Keys are `portfolioId:TICKER`,
   * values are ISO dirty-at stamps. Hydrates liveCache so Score Pending survives
   * reload (in-memory dirty alone was lost and falsely showed High Alignment).
   */
  tickerConvictionDirtyAt?: Record<string, string>;
}

export interface UserWorkspace {
  portfolios: Portfolio[];
  strategies: Strategy[];
  chipLibrary: RuleChip[];
  watchlist: WatchlistItem[];
  logsByTicker: Record<string, LogEntry[]>;
  captain: CaptainProfile;
  shareFills: PortfolioTransaction[];
  flags: UserFlags;
}

/** Empty Beta workspace — no demo PORTFOLIOS seed; defaults available to apply. */
export function emptyWorkspace(captainName = "Captain"): UserWorkspace {
  const strategies = DEFAULT_STRATEGIES.map((strategy) => ({
    ...strategy,
    appliedPortfolioIds: [] as string[],
    tickerExclusions: {} as Record<string, string[]>,
  }));
  return {
    portfolios: [],
    strategies,
    chipLibrary: [...CHIP_LIBRARY_SEED],
    watchlist: [],
    logsByTicker: {},
    captain: { ...DEFAULT_CAPTAIN, handle: captainName },
    shareFills: [],
    flags: {},
  };
}

export async function loadUserWorkspace(
  userId: string,
  captainName?: string,
): Promise<UserWorkspace> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("user_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const fallback = emptyWorkspace(captainName);
  if (error) {
    console.warn("user_state fetch failed; using empty workspace", error.message);
    return fallback;
  }
  if (!data) {
    try {
      await saveUserWorkspace(fallback, userId);
    } catch (saveErr) {
      console.warn("user_state seed failed", saveErr);
    }
    return fallback;
  }

  const portfolios = (data.portfolios as Portfolio[]) ?? [];
  const rawStrategies = (data.strategies as Strategy[]) ?? [];
  const strategies =
    rawStrategies.length === 0
      ? fallback.strategies
      : mergeStrategiesForHydrate(rawStrategies, portfolios);

  return {
    portfolios,
    strategies,
    chipLibrary:
      ((data.chip_library as RuleChip[])?.length
        ? (data.chip_library as RuleChip[])
        : fallback.chipLibrary),
    watchlist: (data.watchlist as WatchlistItem[]) ?? [],
    logsByTicker: (data.logs_by_ticker as Record<string, LogEntry[]>) ?? {},
    captain: {
      ...fallback.captain,
      ...((data.captain as CaptainProfile) ?? {}),
      handle:
        (data.captain as CaptainProfile | undefined)?.handle ||
        captainName ||
        fallback.captain.handle,
    },
    shareFills: normalizePortfolioTransactions(data.share_fills),
    flags: (data.flags as UserFlags) ?? {},
  };
}

function workspacePayload(workspace: UserWorkspace, userId: string) {
  return {
    user_id: userId,
    portfolios: workspace.portfolios,
    strategies: workspace.strategies,
    chip_library: workspace.chipLibrary,
    watchlist: workspace.watchlist,
    logs_by_ticker: workspace.logsByTicker,
    captain: workspace.captain,
    share_fills: workspace.shareFills,
    flags: workspace.flags,
    updated_at: new Date().toISOString(),
  };
}

export function workspacePayloadBytes(workspace: UserWorkspace): number {
  return new TextEncoder().encode(
    JSON.stringify(workspacePayload(workspace, "")),
  ).byteLength;
}

export async function saveUserWorkspace(
  workspace: UserWorkspace,
  trustedUserId?: string,
): Promise<void> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not signed in");

  const bytes = workspacePayloadBytes(workspace);
  perfValue("workspace-payload-bytes", bytes);
  if (bytes > WORKSPACE_PAYLOAD_BUDGET_BYTES) {
    throw new Error(
      `Workspace payload ${bytes} bytes exceeds ${WORKSPACE_PAYLOAD_BUDGET_BYTES} byte budget`,
    );
  }

  await measureAsync("workspace-write", async () => {
    const { error } = await supabase
      .from("user_state")
      .upsert(workspacePayload(workspace, userId), { onConflict: "user_id" });
    if (error) throw error;
  });
}

/** Serializes writes per account; AppState's debounce coalesces rapid changes. */
export function saveUserWorkspaceSerialized(
  workspace: UserWorkspace,
  userId: string,
): Promise<void> {
  const previous = workspaceWriteChains.get(userId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => saveUserWorkspace(workspace, userId));
  workspaceWriteChains.set(userId, next);
  void next.finally(() => {
    if (workspaceWriteChains.get(userId) === next) {
      workspaceWriteChains.delete(userId);
    }
  });
  return next;
}

export interface TickerMark {
  ticker: string;
  lastPrice: number;
  asOf: string;
  source: string;
}

/** Upsert latest real quote marks for the signed-in account. */
export async function upsertTickerMarks(
  rows: TickerMark[],
  trustedUserId?: string,
): Promise<void> {
  const valid = rows.filter(
    (row) =>
      row.ticker.trim() &&
      Number.isFinite(row.lastPrice) &&
      row.lastPrice > 0 &&
      !Number.isNaN(Date.parse(row.asOf)),
  );
  if (valid.length === 0) return;
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;

  const updatedAt = new Date().toISOString();
  const payload = valid.map((row) => ({
    user_id: userId,
    ticker: row.ticker.trim().toUpperCase(),
    last_price: row.lastPrice,
    as_of: row.asOf,
    source: row.source,
    updated_at: updatedAt,
  }));
  const { error } = await supabase
    .from("ticker_marks")
    .upsert(payload, { onConflict: "user_id,ticker" });
  if (error) {
    console.warn("ticker marks write failed", error.message);
  }
}

/** Fetch account marks used to hydrate liveCache before the first cycle read. */
export async function fetchTickerMarks(trustedUserId?: string): Promise<TickerMark[]> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("ticker_marks")
    .select("ticker, last_price, as_of, source")
    .eq("user_id", userId);
  if (error) {
    console.warn("ticker marks fetch failed", error.message);
    return [];
  }
  return (data ?? [])
    .map((row) => ({
      ticker: String(row.ticker).toUpperCase(),
      lastPrice: Number(row.last_price),
      asOf: String(row.as_of),
      source: String(row.source),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.lastPrice) &&
        row.lastPrice > 0 &&
        !Number.isNaN(Date.parse(row.asOf)),
    );
}

export async function appendConvictionSnapshots(
  rows: {
    portfolioId: string;
    strategyId: string;
    ticker: string;
    asOf: string;
    conviction: number;
    status?: string;
    payload?: Record<string, unknown>;
  }[],
  trustedUserId?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;

  const payload = rows.map((row) => ({
    user_id: userId,
    portfolio_id: row.portfolioId,
    strategy_id: row.strategyId,
    ticker: row.ticker,
    as_of: row.asOf,
    conviction: row.conviction,
    status: row.status ?? null,
    payload: row.payload ?? {},
  }));

  const { error } = await supabase
    .from("conviction_snapshots")
    .upsert(payload, {
      onConflict: "user_id,portfolio_id,strategy_id,ticker,as_of",
    });
  if (error) {
    console.warn("conviction snapshot write failed", error.message);
  }
}

/** One daily book/strategy mark — strategyId '' = whole book. */
export interface PortfolioSnapshotRow {
  portfolioId: string;
  /** Empty string = whole-book mark (avoids Postgres NULL unique pitfalls). */
  strategyId: string;
  asOf: string;
  holdingsMarketValue: number;
  costBasis: number;
  cashAvailable: number;
  totalValue: number;
  openPnl: number;
  openPnlPct: number;
  metrics?: Record<string, unknown>;
}

export async function appendPortfolioSnapshots(
  rows: PortfolioSnapshotRow[],
  trustedUserId?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return;

  // Upsert replaces the whole metrics jsonb. If this write omits conviction
  // (pending / zero score), preserve any existing non-zero check-day mark.
  const mergeKeys = rows.filter(
    (row) =>
      row.metrics == null ||
      !Object.prototype.hasOwnProperty.call(row.metrics, "conviction"),
  );
  const preserved = new Map<string, Record<string, unknown>>();
  if (mergeKeys.length > 0) {
    const portfolioIds = [...new Set(mergeKeys.map((r) => r.portfolioId))];
    const strategyIds = [...new Set(mergeKeys.map((r) => r.strategyId))];
    const asOfs = [...new Set(mergeKeys.map((r) => r.asOf))];
    const { data: existing } = await supabase
      .from("portfolio_snapshots")
      .select("portfolio_id, strategy_id, as_of, metrics")
      .eq("user_id", userId)
      .in("portfolio_id", portfolioIds)
      .in("strategy_id", strategyIds)
      .in("as_of", asOfs);
    for (const row of existing ?? []) {
      const metrics = (row.metrics as Record<string, unknown>) ?? {};
      const raw = metrics.conviction;
      const conviction = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(conviction) || conviction === 0) continue;
      preserved.set(
        `${row.portfolio_id}|${row.strategy_id}|${row.as_of}`,
        metrics,
      );
    }
  }

  const payload = rows.map((row) => {
    const key = `${row.portfolioId}|${row.strategyId}|${row.asOf}`;
    const nextMetrics = { ...(row.metrics ?? {}) };
    const prior = preserved.get(key);
    if (
      prior &&
      !Object.prototype.hasOwnProperty.call(nextMetrics, "conviction") &&
      prior.conviction != null
    ) {
      nextMetrics.conviction = prior.conviction;
    }
    return {
      user_id: userId,
      portfolio_id: row.portfolioId,
      strategy_id: row.strategyId,
      as_of: row.asOf,
      holdings_market_value: row.holdingsMarketValue,
      cost_basis: row.costBasis,
      cash_available: row.cashAvailable,
      total_value: row.totalValue,
      open_pnl: row.openPnl,
      open_pnl_pct: row.openPnlPct,
      metrics: nextMetrics,
    };
  });

  const { error } = await supabase
    .from("portfolio_snapshots")
    .upsert(payload, {
      onConflict: "user_id,portfolio_id,strategy_id,as_of",
    });
  if (error) {
    console.warn("portfolio snapshot write failed", error.message);
  }
}

export interface PortfolioSnapshotRecord {
  portfolioId: string;
  strategyId: string;
  asOf: string;
  holdingsMarketValue: number;
  costBasis: number;
  cashAvailable: number;
  totalValue: number;
  openPnl: number;
  openPnlPct: number;
  metrics: Record<string, unknown>;
}

export async function fetchPortfolioSnapshots(input: {
  userId?: string;
  portfolioId: string;
  /** null / undefined = whole book (`strategy_id = ''`). */
  strategyId?: string | null;
  from?: string;
  to?: string;
}): Promise<PortfolioSnapshotRecord[]> {
  const supabase = getSupabase();
  const userId = input.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  const strategyId = input.strategyId ?? "";
  let query = supabase
    .from("portfolio_snapshots")
    .select(
      "portfolio_id, strategy_id, as_of, holdings_market_value, cost_basis, cash_available, total_value, open_pnl, open_pnl_pct, metrics",
    )
    .eq("user_id", userId)
    .eq("portfolio_id", input.portfolioId)
    .eq("strategy_id", strategyId)
    .order("as_of", { ascending: true });

  if (input.from) query = query.gte("as_of", input.from);
  if (input.to) query = query.lte("as_of", input.to);

  const { data, error } = await query;
  if (error) {
    console.warn("portfolio snapshot fetch failed", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    portfolioId: row.portfolio_id as string,
    strategyId: row.strategy_id as string,
    asOf: row.as_of as string,
    holdingsMarketValue: Number(row.holdings_market_value),
    costBasis: Number(row.cost_basis),
    cashAvailable: Number(row.cash_available),
    totalValue: Number(row.total_value),
    openPnl: Number(row.open_pnl),
    openPnlPct: Number(row.open_pnl_pct),
    metrics: (row.metrics as Record<string, unknown>) ?? {},
  }));
}

export interface ConvictionSnapshotRecord {
  portfolioId: string;
  strategyId: string;
  ticker: string;
  asOf: string;
  conviction: number;
  status: string | null;
  payload: Record<string, unknown>;
}

export async function fetchConvictionSnapshots(input: {
  userId?: string;
  portfolioIds?: string[];
  strategyIds?: string[];
  tickers?: string[];
  from?: string;
  to?: string;
}): Promise<ConvictionSnapshotRecord[]> {
  const supabase = getSupabase();
  const userId = input.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  let query = supabase
    .from("conviction_snapshots")
    .select(
      "portfolio_id, strategy_id, ticker, as_of, conviction, status, payload",
    )
    .eq("user_id", userId)
    .order("as_of", { ascending: true });

  if (input.portfolioIds && input.portfolioIds.length > 0) {
    query = query.in("portfolio_id", input.portfolioIds);
  }
  if (input.strategyIds && input.strategyIds.length > 0) {
    query = query.in("strategy_id", input.strategyIds);
  }
  if (input.tickers && input.tickers.length > 0) {
    query = query.in(
      "ticker",
      input.tickers.map((t) => t.toUpperCase()),
    );
  }
  if (input.from) query = query.gte("as_of", input.from);
  if (input.to) query = query.lte("as_of", input.to);

  const { data, error } = await query;
  if (error) {
    console.warn("conviction snapshot fetch failed", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    portfolioId: row.portfolio_id as string,
    strategyId: row.strategy_id as string,
    ticker: (row.ticker as string).toUpperCase(),
    asOf: row.as_of as string,
    conviction: Number(row.conviction),
    status: (row.status as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
  }));
}

export type { ForgeCheckEvent } from "../forge/planAdherence";

/** Append-only Plan Adherence check / hold events. */
export async function appendForgeCheckEvents(
  rows: import("../forge/planAdherence").ForgeCheckEvent[],
  trustedUserId?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const payload = rows.map((row) => ({
    user_id: userId,
    portfolio_id: row.portfolioId,
    strategy_id: row.strategyId,
    ticker: row.ticker.toUpperCase(),
    checked_at: row.checkedAt,
    as_of: row.asOf,
    kind: row.kind,
    primary_status: row.primaryStatus,
    flags: row.flags,
    conviction: row.conviction,
  }));

  const { error } = await supabase.from("forge_check_events").insert(payload);
  if (error) {
    console.warn("forge_check_events write failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function fetchForgeCheckEvents(input: {
  userId?: string;
  portfolioId: string;
  strategyIds?: string[] | null;
  fromIso?: string;
  toIso?: string;
}): Promise<import("../forge/planAdherence").ForgeCheckEvent[]> {
  const supabase = getSupabase();
  const userId = input.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];

  let query = supabase
    .from("forge_check_events")
    .select(
      "id, portfolio_id, strategy_id, ticker, checked_at, as_of, kind, primary_status, flags, conviction",
    )
    .eq("user_id", userId)
    .eq("portfolio_id", input.portfolioId)
    .order("checked_at", { ascending: true });

  if (input.strategyIds && input.strategyIds.length > 0) {
    query = query.in("strategy_id", input.strategyIds);
  }
  if (input.fromIso) query = query.gte("checked_at", input.fromIso);
  if (input.toIso) query = query.lte("checked_at", input.toIso);

  const { data, error } = await query;
  if (error) {
    console.warn("forge_check_events fetch failed", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    portfolioId: row.portfolio_id as string,
    strategyId: row.strategy_id as string,
    ticker: (row.ticker as string).toUpperCase(),
    checkedAt: row.checked_at as string,
    asOf: row.as_of as string,
    kind: row.kind as "status" | "hold",
    primaryStatus: (row.primary_status as string | null) ?? null,
    flags: Array.isArray(row.flags)
      ? (row.flags as import("../../types").StatusType[])
      : [],
    conviction:
      row.conviction == null ? null : Number(row.conviction),
  }));
}

export interface StrategyCheckStateRecord {
  strategyId: string;
  cadence: CheckInterval;
  lastRunId: string | null;
  lastCycleAsOf: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface StrategyCheckScheduleRecord {
  strategyId: string;
  cadence: CheckInterval;
  nextDueAt: string;
  definitionHash: string;
}

export interface StrategyCheckLatestResultRecord {
  portfolioId: string;
  strategyId: string;
  ticker: string;
  runId: string;
  cycleAsOf: string;
  definitionHash: string;
  workspaceUpdatedAt: string;
  conviction: number;
  status: string | null;
  resolved: ResolvedStatus;
  payload: Record<string, unknown>;
}

export interface StrategyCheckCombinedResultRecord {
  portfolioId: string;
  ticker: string;
  strategyIds: string[];
  inputRevision: Record<string, string[]>;
  runId: string;
  cycleAsOf: string;
  cycleKey: string;
  workspaceUpdatedAt: string;
  conviction: number;
  status: string | null;
  resolved: ResolvedStatus;
  payload: Record<string, unknown>;
}

export interface StrategyCheckRunRecord {
  id: string;
  strategyId: string;
  cadence: CheckInterval;
  status: string;
  attemptCount: number;
  error: string | null;
  errorCategory: string | null;
  affectedTickers: string[];
  nextRetryAt: string | null;
  scheduledFor: string;
  completedAt: string | null;
}

export function mapStrategyCheckRunRows(
  rows: Array<Record<string, unknown>>,
): StrategyCheckRunRecord[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    strategyId: String(row.strategy_id ?? ""),
    cadence: String(row.cadence ?? "1D") as CheckInterval,
    status: String(row.status ?? "pending"),
    attemptCount: Number(row.attempt_count ?? 0),
    error: row.error == null ? null : String(row.error),
    errorCategory: row.error_category == null ? null : String(row.error_category),
    affectedTickers: Array.isArray(row.affected_tickers)
      ? (row.affected_tickers as string[])
      : [],
    nextRetryAt: row.next_retry_at == null ? null : String(row.next_retry_at),
    scheduledFor: String(row.scheduled_for ?? ""),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
  }));
}

export async function fetchStrategyCheckRuns(
  trustedUserId?: string,
): Promise<StrategyCheckRunRecord[]> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("strategy_check_runs")
    .select(
      "id,strategy_id,cadence,status,attempt_count,error,error_category,affected_tickers,next_retry_at,scheduled_for,completed_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    // Older DBs without new columns still return core fields when select fails —
    // fall back to a minimal projection.
    const fallback = await supabase
      .from("strategy_check_runs")
      .select(
        "id,strategy_id,cadence,status,attempt_count,error,scheduled_for,completed_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (fallback.error) {
      console.warn("strategy_check_runs fetch failed", fallback.error.message);
      return [];
    }
    return mapStrategyCheckRunRows(fallback.data ?? []);
  }
  return mapStrategyCheckRunRows(data ?? []);
}

export function combinedResultMatchesScope(
  result: StrategyCheckCombinedResultRecord,
  strategyIds: string[],
  schedules: StrategyCheckScheduleRecord[],
): boolean {
  const expectedIds = [...strategyIds].sort();
  if (
    expectedIds.length !== result.strategyIds.length ||
    expectedIds.some((id, index) => id !== result.strategyIds[index])
  ) return false;
  return expectedIds.every((strategyId) => {
    const expected = [...new Set(
      schedules
        .filter((row) => row.strategyId === strategyId)
        .map((row) => row.definitionHash),
    )].sort();
    const actual = result.inputRevision[strategyId] ?? [];
    return (
      expected.length > 0 &&
      expected.length === actual.length &&
      expected.every((hash, index) => hash === actual[index])
    );
  });
}

export function filterCurrentStrategyCheckResults(
  results: StrategyCheckLatestResultRecord[],
  schedules: StrategyCheckScheduleRecord[],
): StrategyCheckLatestResultRecord[] {
  return results.filter((result) =>
    schedules.some(
      (schedule) =>
        schedule.strategyId === result.strategyId &&
        schedule.definitionHash === result.definitionHash,
    ),
  );
}

export function mapStrategyCheckStateRows(
  rows: Array<Record<string, unknown>>,
): StrategyCheckStateRecord[] {
  return rows.flatMap((row) => {
    const strategyId = String(row.strategy_id ?? "");
    const cadence = String(row.cadence ?? "") as CheckInterval;
    if (!strategyId || !cadence) return [];
    return [{
      strategyId,
      cadence,
      lastRunId: row.last_run_id == null ? null : String(row.last_run_id),
      lastCycleAsOf:
        row.last_cycle_as_of == null ? null : String(row.last_cycle_as_of),
      lastSuccessAt:
        row.last_success_at == null ? null : String(row.last_success_at),
      lastError: row.last_error == null ? null : String(row.last_error),
    }];
  });
}

export function mapStrategyCheckScheduleRows(
  rows: Array<Record<string, unknown>>,
): StrategyCheckScheduleRecord[] {
  return rows.flatMap((row) => {
    const strategyId = String(row.strategy_id ?? "");
    const cadence = String(row.cadence ?? "") as CheckInterval;
    const nextDueAt = String(row.next_due_at ?? "");
    if (!strategyId || !cadence || Number.isNaN(Date.parse(nextDueAt))) return [];
    return [{
      strategyId,
      cadence,
      nextDueAt,
      definitionHash: String(row.definition_hash ?? ""),
    }];
  });
}

export function mapStrategyCheckLatestResultRows(
  rows: Array<Record<string, unknown>>,
): StrategyCheckLatestResultRecord[] {
  return rows.flatMap((row) => {
    const portfolioId = String(row.portfolio_id ?? "");
    const strategyId = String(row.strategy_id ?? "");
    const ticker = String(row.ticker ?? "").toUpperCase();
    const cycleAsOf = String(row.cycle_as_of ?? "");
    const conviction = Number(row.conviction);
    if (
      !portfolioId ||
      !strategyId ||
      !ticker ||
      Number.isNaN(Date.parse(cycleAsOf)) ||
      !Number.isFinite(conviction)
    ) return [];
    return [{
      portfolioId,
      strategyId,
      ticker,
      runId: String(row.run_id ?? ""),
      cycleAsOf,
      definitionHash: String(row.definition_hash ?? ""),
      workspaceUpdatedAt: String(row.workspace_updated_at ?? ""),
      conviction,
      status: row.status == null ? null : String(row.status),
      resolved: (row.resolved ?? {}) as ResolvedStatus,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }];
  });
}

export function mapStrategyCheckCombinedResultRows(
  rows: Array<Record<string, unknown>>,
): StrategyCheckCombinedResultRecord[] {
  return rows.flatMap((row) => {
    const portfolioId = String(row.portfolio_id ?? "");
    const ticker = String(row.ticker ?? "").toUpperCase();
    const strategyIds = Array.isArray(row.strategy_ids)
      ? row.strategy_ids.map(String).sort()
      : [];
    const cycleAsOf = String(row.cycle_as_of ?? "");
    const conviction = Number(row.conviction);
    if (
      !portfolioId ||
      !ticker ||
      strategyIds.length === 0 ||
      Number.isNaN(Date.parse(cycleAsOf)) ||
      !Number.isFinite(conviction)
    ) return [];
    return [{
      portfolioId,
      ticker,
      strategyIds,
      inputRevision: (row.input_revision ?? {}) as Record<string, string[]>,
      runId: String(row.run_id ?? ""),
      cycleAsOf,
      cycleKey: String(row.cycle_key ?? ""),
      workspaceUpdatedAt: String(row.workspace_updated_at ?? ""),
      conviction,
      status: row.status == null ? null : String(row.status),
      resolved: (row.resolved ?? {}) as ResolvedStatus,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    }];
  });
}

export async function fetchStrategyCheckState(
  trustedUserId?: string,
): Promise<StrategyCheckStateRecord[]> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("strategy_check_state")
    .select(
      "strategy_id, cadence, last_run_id, last_cycle_as_of, last_success_at, last_error",
    )
    .eq("user_id", userId);
  if (error) throw new Error(`strategy check state fetch failed: ${error.message}`);
  return mapStrategyCheckStateRows((data ?? []) as Array<Record<string, unknown>>);
}

export async function fetchStrategyCheckSchedules(
  trustedUserId?: string,
): Promise<StrategyCheckScheduleRecord[]> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("strategy_check_schedules")
    .select("strategy_id, cadence, next_due_at, definition_hash")
    .eq("user_id", userId);
  if (error) throw new Error(`strategy check schedules fetch failed: ${error.message}`);
  return mapStrategyCheckScheduleRows(
    (data ?? []) as Array<Record<string, unknown>>,
  );
}

export async function fetchStrategyCheckLatestResults(
  trustedUserId?: string,
): Promise<StrategyCheckLatestResultRecord[]> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("strategy_check_latest_results")
    .select(
      "portfolio_id, strategy_id, ticker, run_id, cycle_as_of, definition_hash, workspace_updated_at, conviction, status, resolved, payload",
    )
    .eq("user_id", userId);
  if (error) throw new Error(`strategy check results fetch failed: ${error.message}`);
  return mapStrategyCheckLatestResultRows(
    (data ?? []) as Array<Record<string, unknown>>,
  );
}

export async function fetchStrategyCheckCombinedResults(
  trustedUserId?: string,
): Promise<StrategyCheckCombinedResultRecord[]> {
  const supabase = getSupabase();
  const userId =
    trustedUserId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("strategy_check_combined_latest_results")
    .select(
      "portfolio_id,ticker,strategy_ids,input_revision,run_id,cycle_as_of,cycle_key,workspace_updated_at,conviction,status,resolved,payload",
    )
    .eq("user_id", userId);
  if (error) throw new Error(`combined check results fetch failed: ${error.message}`);
  return mapStrategyCheckCombinedResultRows(
    (data ?? []) as Array<Record<string, unknown>>,
  );
}

/** Reconcile normalized projections and make a changed strategy due now. */
export async function requestServerStrategyFirstCheck(
  strategyId: string,
): Promise<void> {
  const { error } = await getSupabase().rpc("reconcile_strategy_first_check", {
    p_strategy_id: strategyId,
  });
  if (error) throw new Error(`server first-check reconcile failed: ${error.message}`);
}
