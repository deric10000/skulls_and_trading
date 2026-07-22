import type {
  CaptainProfile,
  LogEntry,
  Portfolio,
  PortfolioTransaction,
  RuleChip,
  Strategy,
  WatchlistItem,
} from "../../types";
import { CHIP_LIBRARY_SEED, DEFAULT_CAPTAIN, DEFAULT_STRATEGIES } from "../../data";
import { getSupabase } from "../auth/supabaseClient";
import { normalizePortfolioTransactions } from "../finance/portfolioTransactions";
import { mergeStrategiesForHydrate } from "./strategyMerge";

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
  captainName?: string,
): Promise<UserWorkspace> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("user_state")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const fallback = emptyWorkspace(captainName);
  if (error) {
    console.warn("user_state fetch failed; using empty workspace", error.message);
    return fallback;
  }
  if (!data) {
    try {
      await saveUserWorkspace(fallback);
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

export async function saveUserWorkspace(workspace: UserWorkspace): Promise<void> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");

  const { error } = await supabase.from("user_state").upsert(
    {
      user_id: auth.user.id,
      portfolios: workspace.portfolios,
      strategies: workspace.strategies,
      chip_library: workspace.chipLibrary,
      watchlist: workspace.watchlist,
      logs_by_ticker: workspace.logsByTicker,
      captain: workspace.captain,
      share_fills: workspace.shareFills,
      flags: workspace.flags,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export interface TickerMark {
  ticker: string;
  lastPrice: number;
  asOf: string;
  source: string;
}

/** Upsert latest real quote marks for the signed-in account. */
export async function upsertTickerMarks(rows: TickerMark[]): Promise<void> {
  const valid = rows.filter(
    (row) =>
      row.ticker.trim() &&
      Number.isFinite(row.lastPrice) &&
      row.lastPrice > 0 &&
      !Number.isNaN(Date.parse(row.asOf)),
  );
  if (valid.length === 0) return;
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const updatedAt = new Date().toISOString();
  const payload = valid.map((row) => ({
    user_id: auth.user!.id,
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
export async function fetchTickerMarks(): Promise<TickerMark[]> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from("ticker_marks")
    .select("ticker, last_price, as_of, source")
    .eq("user_id", auth.user.id);
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
    strategyId: string;
    ticker: string;
    asOf: string;
    conviction: number;
    status?: string;
    payload?: Record<string, unknown>;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const payload = rows.map((row) => ({
    user_id: auth.user!.id,
    strategy_id: row.strategyId,
    ticker: row.ticker,
    as_of: row.asOf,
    conviction: row.conviction,
    status: row.status ?? null,
    payload: row.payload ?? {},
  }));

  const { error } = await supabase
    .from("conviction_snapshots")
    .upsert(payload, { onConflict: "user_id,strategy_id,ticker,as_of" });
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
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

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
      .eq("user_id", auth.user.id)
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
      user_id: auth.user!.id,
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
  portfolioId: string;
  /** null / undefined = whole book (`strategy_id = ''`). */
  strategyId?: string | null;
  from?: string;
  to?: string;
}): Promise<PortfolioSnapshotRecord[]> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const strategyId = input.strategyId ?? "";
  let query = supabase
    .from("portfolio_snapshots")
    .select(
      "portfolio_id, strategy_id, as_of, holdings_market_value, cost_basis, cash_available, total_value, open_pnl, open_pnl_pct, metrics",
    )
    .eq("user_id", auth.user.id)
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
  strategyId: string;
  ticker: string;
  asOf: string;
  conviction: number;
  status: string | null;
  payload: Record<string, unknown>;
}

export async function fetchConvictionSnapshots(input: {
  strategyIds?: string[];
  tickers?: string[];
  from?: string;
  to?: string;
}): Promise<ConvictionSnapshotRecord[]> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  let query = supabase
    .from("conviction_snapshots")
    .select("strategy_id, ticker, as_of, conviction, status, payload")
    .eq("user_id", auth.user.id)
    .order("as_of", { ascending: true });

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
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Not signed in" };

  const payload = rows.map((row) => ({
    user_id: auth.user!.id,
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
  portfolioId: string;
  strategyIds?: string[] | null;
  fromIso?: string;
  toIso?: string;
}): Promise<import("../forge/planAdherence").ForgeCheckEvent[]> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  let query = supabase
    .from("forge_check_events")
    .select(
      "id, portfolio_id, strategy_id, ticker, checked_at, as_of, kind, primary_status, flags, conviction",
    )
    .eq("user_id", auth.user.id)
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
