import type {
  CaptainProfile,
  LogEntry,
  Portfolio,
  RuleChip,
  ShareFillEvent,
  Strategy,
  WatchlistItem,
} from "../../types";
import { CHIP_LIBRARY_SEED, DEFAULT_CAPTAIN, DEFAULT_STRATEGIES } from "../../data";
import { getSupabase } from "../auth/supabaseClient";
import { mergeStrategiesForHydrate } from "./strategyMerge";

/** One-shot per-user UI markers (persisted in user_state.flags). */
export interface UserFlags {
  /** True once the first-login Onboarding modal has been dismissed. */
  onboardingSeen?: boolean;
}

export interface UserWorkspace {
  portfolios: Portfolio[];
  strategies: Strategy[];
  chipLibrary: RuleChip[];
  watchlist: WatchlistItem[];
  logsByTicker: Record<string, LogEntry[]>;
  captain: CaptainProfile;
  shareFills: ShareFillEvent[];
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
    shareFills: (data.share_fills as ShareFillEvent[]) ?? [],
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
