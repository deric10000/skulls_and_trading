import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  buildSystemTags,
  DEFAULT_CAPTAIN,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_STRATEGIES,
  logTimestamp,
} from "../data";
import { dataSource } from "../lib/datasource";
import {
  getLiveCacheGeneration,
  getLiveCacheRevision,
  getLiveQuote,
  getLastDataPullAt,
  getLastDataPullAtMap,
  getMarketCycleMeta,
  getTickerConvictionDirtyMap,
  hydrateTickerConvictionDirty,
  isConvictionScoreReady,
  markStrategyConvictionDirty,
  markTickerConvictionDirty,
  resetLiveCache,
  setLastDataPullAt,
  setLiveQuotes,
  subscribeLiveCache,
} from "../lib/market/liveCache";
import {
  formatPullStamp,
  readLatestMarketCycle,
  registerPortfolioMarketSymbols,
  runImmediateStrategyCheck,
} from "../lib/market/refresh";
import { fetchMarketQuotes } from "../lib/market/client";
import {
  marketBootFingerprint,
  resetMarketBootGate,
  runMarketBootSingleFlight,
} from "../lib/market/boot";
import {
  enqueueWeatherTaxonomyHydrate,
  ensureWeatherTaxonomyAwaiting,
} from "../lib/weather/hydrateTaxonomy";
import {
  computePortfolioAlignment,
  type PortfolioAlignment,
  type TickerAlignment,
} from "../lib/forge/alignment";
import { getPortfolioAlignmentCached } from "../lib/forge/alignmentCache";
import { withPortfolioApplied } from "../lib/forge/appliedPortfolios";
import {
  INTERVAL_LABEL,
  createRefreshScheduler,
  nextStrategyCheckAt,
  overdueStrategyCheckAt,
} from "../lib/forge/scheduler";
import { strategiesForHolding, isDefaultStrategyId } from "../lib/forge/tickerStrategy";
import { canAddChips, canAddTicker, getBudgetUsage } from "../lib/forge/budgets";
import { debounce } from "../lib/forge/persistence";
import {
  consumeTimeframeMigrations,
  isSubHourTechnicalChip,
} from "../lib/forge/timeframeFloor";
import { resolveAggregatedStatus, resolveStatus } from "../lib/forge/status";
import {
  scoreStock,
  type MetricContext,
  type StockAlignment,
} from "../lib/forge/scoring";
import {
  fetchProfile,
  redeemInviteCode,
  signOutSupabase,
  takePendingInvite,
} from "../lib/auth/session";
import {
  getSupabase,
  getServerScoringMode,
  ensureSupabaseReady,
  isSupabaseConfigured,
} from "../lib/auth/supabaseClient";
import type { UserProfile } from "../lib/auth/types";
import { isAdmin } from "../lib/auth/types";
import type { User } from "@supabase/supabase-js";
import {
  emptyWorkspace,
  combinedResultMatchesScope,
  fetchStrategyCheckCombinedResults,
  filterCurrentStrategyCheckResults,
  fetchStrategyCheckLatestResults,
  fetchStrategyCheckRuns,
  fetchStrategyCheckSchedules,
  fetchStrategyCheckState,
  fetchTickerMarks,
  loadUserWorkspace,
  loadUserWorkspaceSerialized,
  requestServerStrategyFirstCheck,
  saveUserWorkspaceSerialized,
  upsertTickerMarks,
  type StrategyCheckLatestResultRecord,
  type StrategyCheckCombinedResultRecord,
  type StrategyCheckRunRecord,
  type StrategyCheckScheduleRecord,
  type StrategyCheckStateRecord,
  type UserFlags,
  type UserWorkspace,
} from "../lib/userStore";
import {
  archivePortfolioSource as persistPortfolioArchive,
  archivePortfolioTickerHistory as persistTickerHistoryArchive,
  commitPortfolioTransactionBatch,
  deletePortfolioArchivePermanently as persistPermanentArchiveDelete,
  loadPortfolioArchives,
  restorePortfolioArchive as persistPortfolioRestore,
  restorePortfolioTickerHistory as persistTickerHistoryRestore,
  type CommitPortfolioBatchInput,
} from "../lib/userStore/portfolioLedger";
import type { CommitCurrentWatchEditResult } from "../lib/userStore/currentWatchEditStore";
import {
  presentConvictionRun,
  type ConvictionErrorCategory,
  type ConvictionRunPresentation,
} from "../lib/forge/convictionRunState";
import { sanitizeStrategyPatch } from "../lib/userStore/strategyMerge";
import { scheduleStrategyHistory } from "../lib/userStore/strategyHistory";
import type {
  Bucket,
  CaptainProfile,
  LogEntry,
  PageId,
  PendingCashEdit,
  PendingQtyOrder,
  Portfolio,
  PortfolioTransaction,
  RuleChip,
  StatusType,
  Strategy,
  WatchlistItem,
} from "../types";
import { openPnlPercent } from "../lib/finance/averageCost";
import { portfolioWeightPct } from "../lib/finance/portfolioWeight";
import { persistBookAndConvictionMarks } from "../lib/finance/persistMarketMarks";
import { persistForgeCheckEvents } from "../lib/forge/persistCheckEvents";
import {
  PERF_MARK,
  measureAsync,
  measureSync,
  perfCount,
  perfMark,
  perfMeasure,
} from "../lib/performance/marks";

const IMMEDIATE_CHECK_FIELDS = new Set<keyof Strategy>([
  "appliedPortfolioIds",
  "tickerExclusions",
  "rules",
  "ruleTags",
  "categoryWeights",
  "categoryEnabled",
  "trimZoneRules",
  "trimZoneTags",
  "addZoneRules",
  "addZoneTags",
  "goToCashRules",
  "goToCashTags",
  "checkInterval",
  "technicalsInterval",
  "sessionCloseChecks",
]);

function strategyPatchNeedsImmediateCheck(patch: Partial<Strategy>): boolean {
  return (Object.keys(patch) as Array<keyof Strategy>).some((key) =>
    IMMEDIATE_CHECK_FIELDS.has(key),
  );
}

function clonePortfolios(source: Portfolio[]): Portfolio[] {
  return source.map((portfolio) => ({
    ...portfolio,
    holdings: portfolio.holdings.map((holding) => ({
      ...holding,
      strategyIds: [...holding.strategyIds],
    })),
  }));
}

function cloneHoldings(
  holdings: Portfolio["holdings"],
): Portfolio["holdings"] {
  return holdings.map((holding) => ({
    ...holding,
    strategyIds: [...holding.strategyIds],
  }));
}

/** Session snapshot so Current Watch Cancel can discard in-edit mutations. */
export type WatchEditSnapshot = {
  portfolioId: string;
  revision: number;
  holdings: Portfolio["holdings"];
  /** Settled cash at enter-edit (portfolios only). */
  cashAvailable: number;
  /** strategyId → tickerExclusions[portfolioId] at enter-edit time. */
  tickerExclusionsByStrategy: Record<string, string[]>;
  /** strategyId → applied portfolio ids at enter-edit time. */
  appliedPortfolioIdsByStrategy: Record<string, string[]>;
  /** Portfolio-scoped compatibility ledger at enter-edit time. */
  transactions: PortfolioTransaction[];
};

type LogDraft = Pick<LogEntry, "title" | "note" | "strategy">;

export interface AppStateValue {
  isAuthenticated: boolean;
  demoMode: boolean;
  needsOnboarding: boolean;
  captainName: string;
  userProfile: UserProfile | null;
  needsLegalAck: boolean;
  acknowledgeLegal: () => void;
  /** First-login Onboarding modal: true until the user dismisses it once. */
  needsOnboardingModal: boolean;
  /** Modal is on screen — first-login gate OR a manual reopen. */
  onboardingModalOpen: boolean;
  /** Reopen the Onboarding walkthrough on demand (e.g. Home hero button). */
  openOnboardingModal: () => void;
  dismissOnboardingModal: () => void;
  /** Persisted one-shot UI markers (`user_state.flags`). */
  flags: UserFlags;
  /** Record onboarding badge IDs that already showed (or silently backfilled) a toast. */
  markBadgeToastsSeen: (ids: string[]) => void;
  /** Mark a Market Weather layer opened in detail (Weather Reader badge). */
  markWeatherReaderLayer: (
    layer: "market" | "sector" | "industry" | "stock",
  ) => void;
  completeBetaSignIn: () => Promise<void>;
  /** @deprecated Mock-only; Beta uses completeBetaSignIn */
  signIn: (name?: string) => void;
  /** @deprecated Mock-only; Beta uses SignUpForm + completeBetaSignIn */
  signUp: (name: string) => void;
  /** Demo Captain retired for Beta persist — no-op / blocked */
  continueAsDemo: () => void;
  completeOnboarding: () => void;
  signOut: () => void;
  budgetToast: string | null;
  clearBudgetToast: () => void;
  /** Info toast when a scheduled strategy check completes (null when idle). */
  cadenceToast: string | null;
  clearCadenceToast: () => void;
  /** Preview the strategy-check ForgeToast without running a market pull. */
  previewStrategyCheckToast: () => void;

  captain: CaptainProfile;
  updateCaptain: (patch: Partial<CaptainProfile>) => void;

  activePage: PageId;
  setActivePage: (page: PageId) => void;

  watchlist: WatchlistItem[];
  addTicker: (ticker: string) => void;
  removeTicker: (ticker: string) => void;

  selectedTicker: string;
  selectTicker: (ticker: string) => void;
  selectedItem: WatchlistItem | undefined;

  /**
   * Shared Current Watch portfolio selection so other Home surfaces (the Helm
   * metrics) can mirror it. UI selection state only — not persisted workspace
   * data.
   */
  selectedPortfolioId: string | null;
  setSelectedPortfolioId: (id: string | null) => void;
  /**
   * Shared Home strategy scope (null = All strategies). Drives Current Watch
   * filtering and Helm Progress together. Display-only — not persisted.
   * Forge Watch Preview keeps local scope and must not write this.
   */
  watchStrategyScopeId: string | null;
  setWatchStrategyScopeId: (id: string | null) => void;

  strategies: Strategy[];
  createStrategy: () => string;
  updateStrategy: (id: string, patch: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  duplicateStrategy: (id: string) => string | undefined;
  resetStrategy: (id: string) => void;

  /** Live portfolio holdings (persisted per Beta user). */
  portfolios: Portfolio[];
  /** Recoverable sources kept separate so active scoring cannot consume them. */
  archivedPortfolios: Portfolio[];
  setWatchEditPersistencePaused: (paused: boolean) => void;
  archivePortfolioSource: (
    portfolioId: string,
  ) => Promise<"archived" | "conflict" | "failed">;
  restorePortfolioSource: (portfolioId: string) => Promise<boolean>;
  deletePortfolioSourcePermanently: (portfolioId: string) => Promise<boolean>;
  archiveTickerHistory: (
    portfolioId: string,
    ticker: string,
  ) => Promise<{ archiveId: number; purgeAt: string } | null>;
  restoreTickerHistory: (archiveId: number) => Promise<boolean>;
  setTickerEnabledForStrategy: (
    portfolioId: string,
    ticker: string,
    strategyId: string,
    enabled: boolean,
  ) => void;
  /**
   * Add ticker to a portfolio. Requires a `TICKERS` / getTickerInfo hit —
   * otherwise returns `no-data`. Soft-capped for free-tier Yahoo budgets.
   */
  addTickerToPortfolio: (
    portfolioId: string,
    ticker: string,
  ) => "added" | "exists" | "no-data" | "budget";
  /** Atomically persist a reviewed Current Watch edit and server revision. */
  commitCurrentWatchEdit: (input: {
    portfolioId: string;
    orders: PendingQtyOrder[];
    cash: PendingCashEdit | null;
    finalCash: number;
    historyRemovalTickers: string[];
  }) => Promise<
    | ({ status: "applied" } & CommitCurrentWatchEditResult)
    | { status: "conflict" | "failed" }
  >;
  /** Atomically persist and publish a reviewed normalized import batch. */
  applyPortfolioTransactionBatch: (
    input: CommitPortfolioBatchInput,
  ) => Promise<"applied" | "conflict" | "failed">;
  /** Read the durable portfolio + ledger used to build an import preview. */
  loadPortfolioImportBase: (portfolioId: string) => Promise<{
    portfolio: Portfolio;
    transactions: PortfolioTransaction[];
  } | null>;
  /** After edit confirm: refresh daily book marks (incl. cashAdded metrics). */
  persistWatchEditMarks: () => void;
  /** Confirmed fill / cash ledger for this session (mock; later from API). */
  shareFills: PortfolioTransaction[];
  /** Session-only: drop a holding from a portfolio or watchlist. */
  removeTickerFromPortfolio: (portfolioId: string, ticker: string) => void;
  /**
   * Session-only: create an empty portfolio or watchlist for Current Watch.
   * Returns the new id. Not persisted / not a live brokerage link yet.
   */
  createPortfolioSource: (
    label: string,
    type: Portfolio["type"],
  ) => string | null;
  /** Capture holdings + strategy exclusions for Cancel→discard on Current Watch. */
  captureWatchEditSnapshot: (portfolioId: string) => WatchEditSnapshot | null;
  /** Restore a Current Watch edit-session snapshot (session-only). */
  restoreWatchEditSnapshot: (snapshot: WatchEditSnapshot) => void;
  /** Persist strategy-version boundaries created by a confirmed watch edit. */
  recordWatchEditStrategyHistory: (snapshot: WatchEditSnapshot) => void;

  // ---- Strategy Forge chip library (reusable rule chips) ----
  chipLibrary: RuleChip[];
  saveChipToLibrary: (chip: RuleChip) => void;
  removeChipFromLibrary: (chipId: string) => void;
  // Edits a saved library chip. When `propagate` is true, the same field
  // changes are also pushed to every chip across every strategy that was
  // originally added from this library chip (matched via `libraryChipId`) —
  // "Save and Update Chip Settings Everywhere". When false, only the library
  // template changes; chips already added to a strategy keep their current
  // values ("Save Default Chip Settings").
  updateChipInLibrary: (
    chipId: string,
    patch: Partial<RuleChip>,
    propagate: boolean,
  ) => void;

  // ---- Strategy Forge alignment (computed from buckets + strategies + data) ----
  buckets: Bucket[];
  // Computed conviction/status for a whole portfolio (best-aligned per ticker +
  // market-value-weighted aggregate). Memoized per portfolio.
  getPortfolioAlignment: (portfolioId: string) => PortfolioAlignment;
  // A single name's headline alignment (its best-aligned bucket), if computed.
  getStockAlignment: (
    portfolioId: string,
    ticker: string,
  ) => TickerAlignment | undefined;
  // Strategies applied to a ticker **in one portfolio** — never cross-source.
  getAppliedStrategiesForTicker: (
    ticker: string,
    portfolioId: string,
  ) => Strategy[];
  getStrategyChipBreakdown: (
    strategyId: string,
    ticker: string,
    portfolioId?: string,
  ) => StockAlignment | undefined;

  /** ISO last successful live pull per strategy id. */
  lastDataPullAtByStrategyId: Record<string, string>;
  /** Formatted last-known check stamp (strategy pull or cycle meta). */
  getWatchPullStamp: (
    appliedStrategyIds: string[],
    focusedStrategyId?: string | null,
  ) => string | null;
  /** Next check schedule for applied strategies — always when ids are non-empty. */
  getWatchCheckSchedule: (
    appliedStrategyIds: string[],
    focusedStrategyId?: string | null,
  ) => {
    lastAt: string | null;
    nextAt: string;
    /** True when no strategy has stamped a check yet (first-run). */
    waitingOnCycle: boolean;
    /**
     * True when a cadence wall has already passed since lastAt but the check
     * has not stamped yet — show "Check in-progress" instead of jumping to the
     * next future wall (e.g. Monday after Friday close).
     */
    checkInProgress: boolean;
    /** Countdown target while a check is due / applying (next cycle hour — not the next cadence wall). */
    applyAt: string;
  } | null;
  /** False → Current Watch shows No Score until the next successful check. */
  isConvictionScoreReady: (
    portfolioId: string,
    ticker: string,
    strategyIds: string[],
  ) => boolean;
  /** Explicit run presentation when score is not ready (pending vs warning). */
  getConvictionPresentation: (
    portfolioId: string,
    ticker: string,
    strategyIds: string[],
  ) => ConvictionRunPresentation;
  marketLoading: boolean;
  marketError: string | null;
  refreshLiveMarket: () => Promise<void>;
  /** Debounced scoped first-value check for Forge apply/update/Preview. */
  requestImmediateStrategyCheck: (strategyId: string) => void;

  logsByTicker: Record<string, LogEntry[]>;
  addLog: (ticker: string, draft: LogDraft) => void;
  updateLog: (ticker: string, id: string, draft: LogDraft) => void;
  deleteLog: (ticker: string, id: string) => void;
}

interface AppStateStore {
  value: AppStateValue;
  listeners: Set<() => void>;
}
const AppStateStoreContext = createContext<AppStateStore | null>(null);

function currentTimestamp(): string {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return logTimestamp(time);
}

const persistWorkspaceDebounced = debounce(
  (workspace: UserWorkspace, userId: string) => {
    void saveUserWorkspaceSerialized(workspace, userId).catch((err) => {
      console.warn("user_state save failed", err);
    });
  },
  500,
);

function applyWorkspaceToSetters(
  workspace: UserWorkspace,
  setters: {
    setPortfolios: (p: Portfolio[]) => void;
    setArchivedPortfolios: (p: Portfolio[]) => void;
    setStrategies: (s: Strategy[]) => void;
    setChipLibrary: (c: RuleChip[]) => void;
    setWatchlist: (w: WatchlistItem[]) => void;
    setLogsByTicker: (l: Record<string, LogEntry[]>) => void;
    setCaptain: (c: CaptainProfile) => void;
    setShareFills: (f: PortfolioTransaction[]) => void;
    setSelectedTicker: (t: string) => void;
    setCaptainName: (n: string) => void;
    setFlags: (f: UserFlags) => void;
  },
) {
  setters.setPortfolios(clonePortfolios(workspace.portfolios));
  setters.setArchivedPortfolios(clonePortfolios(workspace.archivedPortfolios));
  setters.setStrategies(workspace.strategies);
  setters.setChipLibrary(workspace.chipLibrary);
  setters.setWatchlist(workspace.watchlist);
  setters.setLogsByTicker(workspace.logsByTicker);
  setters.setCaptain(workspace.captain);
  setters.setShareFills(workspace.shareFills);
    setters.setCaptainName(workspace.captain.handle);
  setters.setSelectedTicker(workspace.watchlist[0]?.ticker ?? "");
  setters.setFlags(workspace.flags);
}

function stockAlignmentFromServer(
  row: Pick<
    StrategyCheckLatestResultRecord,
    "resolved" | "payload" | "conviction" | "status"
  >,
): StockAlignment | null {
  const resolved = row.resolved;
  if (!resolved || typeof resolved.primary !== "string") return null;
  const payload = row.payload;
  const categories = Array.isArray(payload.categories)
    ? (payload.categories as StockAlignment["categories"])
    : [];
  const results = Array.isArray(payload.results)
    ? (payload.results as StockAlignment["results"])
    : [];
  const zoneResults = Array.isArray(payload.zoneResults)
    ? (payload.zoneResults as StockAlignment["zoneResults"])
    : [];
  return {
    hasRules: payload.hasRules !== false,
    conviction: row.conviction,
    status: (row.status ?? resolved.primary) as StatusType,
    resolved,
    categories,
    results,
    zoneResults,
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [captainName, setCaptainName] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [needsLegalAck, setNeedsLegalAck] = useState(false);
  const [flags, setFlags] = useState<UserFlags>({});
  // Manual reopen of the Onboarding walkthrough after first login. Separate
  // from the `onboardingSeen` flag gate so returning users can revisit it.
  const [onboardingReopened, setOnboardingReopened] = useState(false);
  const [budgetToast, setBudgetToast] = useState<string | null>(null);
  // Info toast popped when a scheduled strategy check completes.
  const [cadenceToast, setCadenceToast] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [captain, setCaptain] = useState<CaptainProfile>({
    ...DEFAULT_CAPTAIN,
    handle: "Captain",
  });
  const [activePage, setActivePage] = useState<PageId>("home");

  const updateCaptain = useCallback((patch: Partial<CaptainProfile>) => {
    setCaptain((current) => ({ ...current, ...patch }));
  }, []);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(
    null,
  );
  const [watchStrategyScopeId, setWatchStrategyScopeId] = useState<
    string | null
  >(null);
  const [strategies, setStrategies] = useState<Strategy[]>(() =>
    emptyWorkspace().strategies,
  );
  const [buckets] = useState<Bucket[]>(() => dataSource.getBuckets());
  const [chipLibrary, setChipLibrary] = useState<RuleChip[]>(() =>
    emptyWorkspace().chipLibrary,
  );
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [archivedPortfolios, setArchivedPortfolios] = useState<Portfolio[]>([]);
  const [shareFills, setShareFills] = useState<PortfolioTransaction[]>([]);
  const [logsByTicker, setLogsByTicker] = useState<Record<string, LogEntry[]>>(
    {},
  );
  const [marketGeneration, setMarketGeneration] = useState(0);
  const [scoreRevision, setScoreRevision] = useState("0:0");
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const serverScoringMode = getServerScoringMode();
  const [serverCheckState, setServerCheckState] = useState<
    StrategyCheckStateRecord[]
  >([]);
  const [serverCheckSchedules, setServerCheckSchedules] = useState<
    StrategyCheckScheduleRecord[]
  >([]);
  const [serverLatestResults, setServerLatestResults] = useState<
    StrategyCheckLatestResultRecord[]
  >([]);
  const [serverCombinedResults, setServerCombinedResults] = useState<
    StrategyCheckCombinedResultRecord[]
  >([]);
  const [serverCheckRuns, setServerCheckRuns] = useState<
    StrategyCheckRunRecord[]
  >([]);
  const persistEnabled = useRef(false);
  const [watchEditPersistencePaused, setWatchEditPersistencePausedState] =
    useState(false);
  const setWatchEditPersistencePaused = useCallback((paused: boolean) => {
    if (paused) persistWorkspaceDebounced.flush();
    setWatchEditPersistencePausedState(paused);
  }, []);
  const invalidTimeToastKey = useRef("");
  const immediateCheckTimers = useRef(
    new Map<string, ReturnType<typeof window.setTimeout>>(),
  );
  /** Avoid Yahoo spam: one bootstrap first-check attempt per strategy per session. */
  const bootstrappedFirstChecks = useRef(new Set<string>());
  const portfoliosRef = useRef(portfolios);
  const strategiesRef = useRef(strategies);
  const shareFillsRef = useRef(shareFills);
  const userIdRef = useRef(userProfile?.id);
  portfoliosRef.current = portfolios;
  strategiesRef.current = strategies;
  shareFillsRef.current = shareFills;
  userIdRef.current = userProfile?.id;

  useEffect(() => {
    return subscribeLiveCache(() => {
      setMarketGeneration(getLiveCacheGeneration());
      setScoreRevision(
        `${getLiveCacheRevision("scoreInputs")}:${getLiveCacheRevision("scoreReadiness")}`,
      );
    });
  }, []);

  useEffect(
    () => () => {
      immediateCheckTimers.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      immediateCheckTimers.current.clear();
    },
    [],
  );

  const hydrateFromSession = useCallback(async (sessionUser?: User) => {
    const user =
      sessionUser ?? (await getSupabase().auth.getSession()).data.session?.user;
    if (!user) return;
    perfMark(PERF_MARK.authHydrateStart);
    const pending = takePendingInvite();
    if (pending) {
      await redeemInviteCode(pending).catch(() => false);
    }
    const captainName =
      (user.user_metadata?.captain_name as string | undefined) || "Captain";
    const serverScoringEnabled = getServerScoringMode() !== "client";
    const [
      profile,
      workspace,
      tickerMarks,
      checkState,
      checkSchedules,
      latestResults,
      combinedResults,
      checkRuns,
    ] = await Promise.all([
      measureAsync("hydrate-profile", () => fetchProfile(user)),
      measureAsync("hydrate-workspace", () =>
        loadUserWorkspace(user.id, captainName),
      ),
      measureAsync("hydrate-ticker-marks", () => fetchTickerMarks(user.id)),
      serverScoringEnabled
        ? measureAsync("hydrate-check-state", () =>
            fetchStrategyCheckState(user.id),
          )
        : Promise.resolve([]),
      serverScoringEnabled
        ? measureAsync("hydrate-check-schedules", () =>
            fetchStrategyCheckSchedules(user.id),
          )
        : Promise.resolve([]),
      serverScoringEnabled
        ? measureAsync("hydrate-check-results", () =>
            fetchStrategyCheckLatestResults(user.id),
          )
        : Promise.resolve([]),
      serverScoringEnabled
        ? measureAsync("hydrate-combined-results", () =>
            fetchStrategyCheckCombinedResults(user.id),
          )
        : Promise.resolve([]),
      serverScoringEnabled
        ? measureAsync("hydrate-check-runs", () =>
            fetchStrategyCheckRuns(user.id),
          )
        : Promise.resolve([]),
    ]);
    if (!profile) return;
    resetLiveCache();
    setLiveQuotes(
      Object.fromEntries(
        tickerMarks
          .filter((mark) => Number.isFinite(mark.lastPrice) && mark.lastPrice > 0)
          .map((mark) => [
            mark.ticker,
            {
              ticker: mark.ticker,
              lastPrice: mark.lastPrice,
              asOf: mark.asOf,
              source: "live" as const,
            },
          ]),
      ),
    );
    const normalizedStamps =
      getServerScoringMode() === "authoritative"
        ? checkState.reduce<Record<string, string>>((out, row) => {
            if (!row.lastCycleAsOf) return out;
            const prior = out[row.strategyId];
            if (!prior || Date.parse(row.lastCycleAsOf) > Date.parse(prior)) {
              out[row.strategyId] = row.lastCycleAsOf;
            }
            return out;
          }, {})
        : workspace.flags.lastDataPullAtByStrategyId ?? {};
    for (const [strategyId, stamp] of Object.entries(normalizedStamps)) {
      if (!Number.isNaN(Date.parse(stamp))) {
        setLastDataPullAt(strategyId, stamp);
      }
    }
    setServerCheckState(checkState);
    setServerCheckSchedules(checkSchedules);
    setServerLatestResults(latestResults);
    setServerCombinedResults(combinedResults);
    setServerCheckRuns(checkRuns);
    hydrateTickerConvictionDirty(workspace.flags.tickerConvictionDirtyAt);
    const timeframeMigrations = consumeTimeframeMigrations();
    applyWorkspaceToSetters(workspace, {
      setPortfolios,
      setArchivedPortfolios,
      setStrategies,
      setChipLibrary,
      setWatchlist,
      setLogsByTicker,
      setCaptain,
      setShareFills,
      setSelectedTicker,
      setCaptainName,
      setFlags,
    });
    setUserProfile(profile);
    setDemoMode(false);
    setNeedsOnboarding(false);
    setNeedsLegalAck(true);
    setIsAuthenticated(true);
    setActivePage("home");
    if (timeframeMigrations.length > 0) {
      const labels = timeframeMigrations
        .map(
          (migration) =>
            `${migration.strategyName}: ${migration.chipLabel} (${migration.from} → 1h)`,
        )
        .join("; ");
      setCadenceToast(
        `Updated legacy technical Times to the reliable 1-hour floor — ${labels}.`,
      );
    }
    persistEnabled.current = true;
    perfMark(PERF_MARK.authHydrateEnd);
    perfMeasure(
      "st:duration:auth-hydrate",
      PERF_MARK.authHydrateStart,
      PERF_MARK.authHydrateEnd,
    );
  }, []);

  const completeBetaSignIn = useCallback(async () => {
    await hydrateFromSession();
  }, [hydrateFromSession]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      perfMark(PERF_MARK.authConfigStart);
      const configured = await ensureSupabaseReady();
      perfMark(PERF_MARK.authConfigEnd);
      perfMeasure(
        "st:duration:auth-config",
        PERF_MARK.authConfigStart,
        PERF_MARK.authConfigEnd,
      );
      if (cancelled) return;
      if (!configured) {
        setAuthReady(true);
        perfMark(PERF_MARK.authReady);
        return;
      }
      try {
        perfMark(PERF_MARK.authSessionStart);
        const { data } = await getSupabase().auth.getSession();
        perfMark(PERF_MARK.authSessionEnd);
        perfMeasure(
          "st:duration:auth-session",
          PERF_MARK.authSessionStart,
          PERF_MARK.authSessionEnd,
        );
        if (!cancelled && data.session) {
          await hydrateFromSession(data.session.user);
        }
      } catch (err) {
        console.warn("session restore failed", err);
      } finally {
        if (!cancelled) {
          setAuthReady(true);
          perfMark(PERF_MARK.authReady);
        }
      }
      const { data: sub } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          persistEnabled.current = false;
          resetLiveCache();
          resetMarketBootGate();
          bootstrappedFirstChecks.current.clear();
          setServerCheckState([]);
          setServerCheckSchedules([]);
          setServerLatestResults([]);
          setServerCombinedResults([]);
          setIsAuthenticated(false);
          setUserProfile(null);
          setNeedsLegalAck(false);
        }
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hydrateFromSession]);

  const persistSharedMarketState = useCallback((tickers: string[]) => {
    const marks = tickers.flatMap((ticker) => {
      const quote = getLiveQuote(ticker);
      return quote && quote.lastPrice > 0
        ? [
            {
              ticker,
              lastPrice: quote.lastPrice,
              asOf: quote.asOf,
              source: quote.source,
            },
          ]
        : [];
    });
    if (getServerScoringMode() !== "authoritative") {
      setFlags((current) => ({
        ...current,
        lastDataPullAtByStrategyId: getLastDataPullAtMap(),
        tickerConvictionDirtyAt: getTickerConvictionDirtyMap(),
      }));
    }
    return upsertTickerMarks(marks, userIdRef.current);
  }, []);

  const refreshServerScoringState = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || getServerScoringMode() === "client") return;
    const [checkState, checkSchedules, latestResults, combinedResults, checkRuns] =
      await Promise.all([
      fetchStrategyCheckState(userId),
      fetchStrategyCheckSchedules(userId),
      fetchStrategyCheckLatestResults(userId),
      fetchStrategyCheckCombinedResults(userId),
      fetchStrategyCheckRuns(userId),
    ]);
    setServerCheckState(checkState);
    setServerCheckSchedules(checkSchedules);
    setServerLatestResults(latestResults);
    setServerCombinedResults(combinedResults);
    setServerCheckRuns(checkRuns);
    if (getServerScoringMode() === "authoritative") {
      for (const row of checkState) {
        if (!row.lastCycleAsOf) continue;
        const prior = getLastDataPullAt(row.strategyId);
        if (!prior || Date.parse(row.lastCycleAsOf) >= Date.parse(prior)) {
          setLastDataPullAt(row.strategyId, row.lastCycleAsOf);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || serverScoringMode === "client") return;
    const refresh = () => {
      void refreshServerScoringState().catch((error) => {
        console.warn("server scoring refresh failed", error);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, refreshServerScoringState, serverScoringMode]);

  const refreshLiveMarket = useCallback(async () => {
    const tickers = [
      ...new Set(
        portfolios.flatMap((portfolio) =>
          portfolio.holdings.map((holding) => holding.ticker),
        ),
      ),
    ];
    const applied = strategies.filter(
      (strategy) => (strategy.appliedPortfolioIds ?? []).length > 0,
    );
    setMarketLoading(true);
    setMarketError(null);
    try {
      const authoritative = getServerScoringMode() === "authoritative";
      const cycleAsOf = await readLatestMarketCycle(
        tickers,
        authoritative ? [] : applied,
      );
      if (cycleAsOf) {
        const writes: Promise<unknown>[] = [persistSharedMarketState(tickers)];
        if (!authoritative) {
          writes.push(
            persistBookAndConvictionMarks(portfolios, strategies, tickers, {
              ledger: shareFills,
              userId: userIdRef.current,
            }),
          );
        }
        void Promise.all(writes);
      }
    } catch (error) {
      setMarketError(
        error instanceof Error ? error.message : "Market refresh failed",
      );
    } finally {
      setMarketLoading(false);
    }
  }, [portfolios, strategies, shareFills, persistSharedMarketState]);

  const refreshStrategyTickers = useCallback(
    async (
      strategyId: string,
      tickers: string[],
      requiredCycleAt: string,
    ): Promise<boolean> => {
      const applied = strategies.filter((s) => s.id === strategyId);
      setMarketLoading(true);
      try {
        const cycleAsOf = await readLatestMarketCycle(
          tickers,
          applied,
          requiredCycleAt,
        );
        if (cycleAsOf) {
          void Promise.all([
            persistSharedMarketState(tickers),
            persistBookAndConvictionMarks(portfolios, strategies, tickers, {
              strategyId,
              ledger: shareFills,
              userId: userIdRef.current,
            }),
            persistForgeCheckEvents({
              portfolios,
              strategies,
              strategyId,
              ledger: shareFills,
              checkedAt: cycleAsOf,
              userId: userIdRef.current,
            }).then((result) => {
              if (!result.ok && result.error) {
                setMarketError(`Check event save failed: ${result.error}`);
              }
            }),
          ]);
          return true;
        }
        return false;
      } finally {
        setMarketLoading(false);
      }
    },
    [strategies, portfolios, shareFills, persistSharedMarketState],
  );

  const requestImmediateStrategyCheck = useCallback((strategyId: string) => {
    const existing = immediateCheckTimers.current.get(strategyId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      immediateCheckTimers.current.delete(strategyId);
      if (getServerScoringMode() === "authoritative") {
        void requestServerStrategyFirstCheck(strategyId)
          .then(refreshServerScoringState)
          .catch((error) => {
            bootstrappedFirstChecks.current.delete(strategyId);
            setMarketError(
              error instanceof Error
                ? error.message
                : "Server strategy check request failed",
            );
          });
        return;
      }
      const strategy = strategiesRef.current.find(
        (item) => item.id === strategyId,
      );
      if (!strategy || (strategy.appliedPortfolioIds ?? []).length === 0) return;
      setMarketLoading(true);
      setMarketError(null);
      void runImmediateStrategyCheck(strategy, portfoliosRef.current)
        .then(async (result) => {
          if (!result) {
            bootstrappedFirstChecks.current.delete(strategyId);
            return;
          }
          bootstrappedFirstChecks.current.add(strategyId);
          await Promise.all([
            persistSharedMarketState(result.tickers),
            persistBookAndConvictionMarks(
              portfoliosRef.current,
              strategiesRef.current,
              result.tickers,
              {
                strategyId,
                ledger: shareFillsRef.current,
                userId: userIdRef.current,
              },
            ),
            persistForgeCheckEvents({
              portfolios: portfoliosRef.current,
              strategies: strategiesRef.current,
              strategyId,
              ledger: shareFillsRef.current,
              checkedAt: result.checkedAt,
              userId: userIdRef.current,
            }).then((persistResult) => {
              if (!persistResult.ok && persistResult.error) {
                setMarketError(
                  `Check event save failed: ${persistResult.error}`,
                );
              }
            }),
          ]);
          setCadenceToast(
            "Strategy check complete. Conviction scores are current.",
          );
        })
        .catch((error) => {
          bootstrappedFirstChecks.current.delete(strategyId);
          setMarketError(
            error instanceof Error
              ? error.message
              : "Immediate strategy check failed",
          );
        })
        .finally(() => setMarketLoading(false));
    }, getServerScoringMode() === "authoritative" ? 800 : 300);
    immediateCheckTimers.current.set(strategyId, timer);
  }, [persistSharedMarketState, refreshServerScoringState]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Authoritative mode still expedites registry sync (merge/replace), but
    // Cloudflare cycle correctness must not depend on this — subscriptions
    // snapshot is authoritative when configured.
    const tickers = [
      ...new Set(
        portfolios.flatMap((portfolio) =>
          portfolio.holdings.map((holding) => holding.ticker),
        ),
      ),
    ];
    if (serverScoringMode === "authoritative") {
      if (tickers.length === 0) return;
      void registerPortfolioMarketSymbols(tickers, "replace");
      return;
    }
    const applied = strategies.filter(
      (strategy) => (strategy.appliedPortfolioIds ?? []).length > 0,
    );
    const fingerprint = marketBootFingerprint(portfolios, strategies);
    void runMarketBootSingleFlight(fingerprint, async () => {
      perfCount("market-boot");
      perfMark(PERF_MARK.marketBootStart);
      try {
        // Registry and KV cycle are independent; overlap their network waits.
        await Promise.allSettled([
          registerPortfolioMarketSymbols(tickers, "replace"),
          refreshLiveMarket(),
        ]);
        // Missing GICS for live-only names: pending until soft hydrate or cycle.
        ensureWeatherTaxonomyAwaiting(tickers);
        // Cron may still be warming (cycle null). Pull book quotes so P&L paints,
        // then run one scoped first check per unstamped applied strategy.
        const missingQuotes = tickers.filter((ticker) => !getLiveQuote(ticker));
        if (missingQuotes.length > 0) {
          perfCount("market-boot-quote-fallback");
          const quoteResult = await fetchMarketQuotes(missingQuotes);
          if (quoteResult?.quotes && Object.keys(quoteResult.quotes).length > 0) {
            setLiveQuotes(quoteResult.quotes);
            await persistSharedMarketState(Object.keys(quoteResult.quotes));
          }
        }
        for (const strategy of applied) {
          if (getLastDataPullAt(strategy.id)) continue;
          if (bootstrappedFirstChecks.current.has(strategy.id)) continue;
          // Claim the slot while the debounced check runs; released on failure.
          bootstrappedFirstChecks.current.add(strategy.id);
          requestImmediateStrategyCheck(strategy.id);
        }
      } finally {
        perfMark(PERF_MARK.marketBootEnd);
        perfMeasure(
          "st:duration:market-boot",
          PERF_MARK.marketBootStart,
          PERF_MARK.marketBootEnd,
        );
      }
    }).catch((error) => {
      setMarketError(
        error instanceof Error ? error.message : "Market bootstrap failed",
      );
    });
  }, [
    isAuthenticated,
    portfolios,
    strategies,
    refreshLiveMarket,
    persistSharedMarketState,
    requestImmediateStrategyCheck,
    serverScoringMode,
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const scheduler = createRefreshScheduler(
      portfolios,
      strategies,
      async (strategyId, tickers, interval, requiredCycleAt) => {
        const succeeded = await refreshStrategyTickers(
          strategyId,
          tickers,
          requiredCycleAt,
        );
        if (succeeded) {
          setCadenceToast(
            `Strategy check complete. Reviewed on your ${INTERVAL_LABEL[interval]} schedule.`,
          );
        }
        return succeeded;
      },
    );
    scheduler.start();
    return () => scheduler.stop();
  }, [
    isAuthenticated,
    portfolios,
    strategies,
    refreshStrategyTickers,
    serverScoringMode,
  ]);

  // Auto-dismiss the cadence info toast after a short read window.
  useEffect(() => {
    if (!cadenceToast) return;
    const timer = window.setTimeout(() => setCadenceToast(null), 12000);
    return () => window.clearTimeout(timer);
  }, [cadenceToast]);

  useEffect(() => {
    if (
      !persistEnabled.current ||
      watchEditPersistencePaused ||
      !isAuthenticated ||
      demoMode ||
      !userProfile?.id
    ) return;
    persistWorkspaceDebounced({
      portfolios,
      archivedPortfolios,
      strategies,
      chipLibrary,
      watchlist,
      logsByTicker,
      captain,
      shareFills,
      flags,
    }, userProfile.id);
  }, [
    portfolios,
    strategies,
    chipLibrary,
    watchlist,
    logsByTicker,
    captain,
    shareFills,
    flags,
    isAuthenticated,
    demoMode,
    userProfile?.id,
    watchEditPersistencePaused,
  ]);

  useEffect(() => {
    const invalid = strategies.flatMap((strategy) =>
      [
        ...(strategy.rules ?? []),
        ...(strategy.trimZoneRules ?? []),
        ...(strategy.addZoneRules ?? []),
        ...(strategy.goToCashRules ?? []),
      ]
        .filter(isSubHourTechnicalChip)
        .map((chip) => `${strategy.name}: ${chip.label} (${chip.dateRange})`),
    );
    const key = invalid.join("|");
    if (!key || key === invalidTimeToastKey.current) return;
    invalidTimeToastKey.current = key;
    setCadenceToast(
      `Update technical Times to 1h or longer before scoring — ${invalid.join("; ")}.`,
    );
  }, [strategies]);

  const idCounter = useRef(0);
  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${Date.now()}-${idCounter.current}`;
  }, []);

  const acknowledgeLegal = useCallback(() => {
    setNeedsLegalAck(false);
  }, []);

  const openOnboardingModal = useCallback(() => {
    setOnboardingReopened(true);
  }, []);

  const dismissOnboardingModal = useCallback(() => {
    setFlags((current) => ({ ...current, onboardingSeen: true }));
    setOnboardingReopened(false);
  }, []);

  const markBadgeToastsSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setFlags((current) => {
      const seen = new Set(current.badgeToastsSeen ?? []);
      let changed = false;
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          changed = true;
        }
      }
      if (!changed) return current;
      return { ...current, badgeToastsSeen: Array.from(seen) };
    });
  }, []);

  const markWeatherReaderLayer = useCallback(
    (layer: "market" | "sector" | "industry" | "stock") => {
      setFlags((current) => {
        const layers = current.weatherReaderLayers ?? [];
        if (layers.includes(layer)) return current;
        return {
          ...current,
          weatherReaderLayers: [...layers, layer],
        };
      });
    },
    [],
  );

  const clearBudgetToast = useCallback(() => setBudgetToast(null), []);
  const clearCadenceToast = useCallback(() => setCadenceToast(null), []);
  const previewStrategyCheckToast = useCallback(() => {
    setCadenceToast(
      "Strategy check complete. Conviction scores are current.",
    );
  }, []);

  const adminBypass = isAdmin(userProfile);

  const signIn = useCallback((name?: string) => {
    // Legacy mock path — only when Supabase is not configured (local UI shell).
    if (isSupabaseConfigured()) return;
    setCaptainName(name?.trim() || "Captain");
    setDemoMode(false);
    setNeedsOnboarding(false);
    setNeedsLegalAck(true);
    setIsAuthenticated(true);
    setActivePage("home");
    const empty = emptyWorkspace(name?.trim() || "Captain");
    applyWorkspaceToSetters(empty, {
      setPortfolios,
      setArchivedPortfolios,
      setStrategies,
      setChipLibrary,
      setWatchlist,
      setLogsByTicker,
      setCaptain,
      setShareFills,
      setSelectedTicker,
      setCaptainName,
      setFlags,
    });
  }, []);

  const signUp = useCallback((name: string) => {
    if (isSupabaseConfigured()) return;
    signIn(name);
    setNeedsOnboarding(true);
  }, [signIn]);

  const continueAsDemo = useCallback(() => {
    setBudgetToast(
      "Demo Captain is retired for Beta. Use an invite code to create an account.",
    );
  }, []);

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
    setActivePage("dashboard");
  }, []);

  const signOut = useCallback(() => {
    persistEnabled.current = false;
    void signOutSupabase();
    resetLiveCache();
    bootstrappedFirstChecks.current.clear();
    setIsAuthenticated(false);
    setDemoMode(false);
    setNeedsOnboarding(false);
    setNeedsLegalAck(false);
    setCaptainName("");
    setUserProfile(null);
    setActivePage("home");
    const empty = emptyWorkspace();
    applyWorkspaceToSetters(empty, {
      setPortfolios,
      setArchivedPortfolios,
      setStrategies,
      setChipLibrary,
      setWatchlist,
      setLogsByTicker,
      setCaptain,
      setShareFills,
      setSelectedTicker,
      setCaptainName,
      setFlags,
    });
  }, []);

  const addTicker = useCallback((rawTicker: string) => {
    const ticker = rawTicker.trim().toUpperCase();
    if (!ticker) return;
    const info = dataSource.getTickerInfo(ticker);
    setWatchlist((current) => {
      if (current.some((item) => item.ticker === ticker)) return current;
      const newItem: WatchlistItem = info
        ? {
            ticker,
            name: `${info.company} · ${info.category}`,
            price: info.lastPrice,
            changePct: 0,
            status: "No Strategy",
            conviction: 0,
            shares: 0,
            avgPrice: 0,
            reason: "Pending research — assign a strategy and log your thesis.",
          }
        : {
            ticker,
            name: "New position · Pending research",
            price: 0,
            changePct: 0,
            status: "No Strategy",
            conviction: 0,
            shares: 0,
            avgPrice: 0,
            reason: "Pending research — assign a strategy and log your thesis.",
          };
      return [...current, newItem];
    });
    setSelectedTicker(ticker);
  }, []);

  const removeTicker = useCallback(
    (ticker: string) => {
      setWatchlist((current) => {
        const next = current.filter((item) => item.ticker !== ticker);
        if (ticker === selectedTicker) {
          setSelectedTicker(next[0]?.ticker ?? "");
        }
        return next;
      });
    },
    [selectedTicker],
  );

  // Mutates AppState.portfolios (+ watchlist mirror). Persisted via user_state.
  const addTickerToPortfolio = useCallback(
    (
      portfolioId: string,
      rawTicker: string,
    ): "added" | "exists" | "no-data" | "budget" => {
      const ticker = rawTicker.trim().toUpperCase();
      if (!ticker) return "no-data";
      const info = dataSource.getTickerInfo(ticker);
      if (!info) return "no-data";

      const portfolio = portfolios.find((item) => item.id === portfolioId);
      if (!portfolio) return "no-data";
      if (portfolio.holdings.some((holding) => holding.ticker === ticker)) {
        return "exists";
      }
      if (!canAddTicker(portfolios, strategies, { adminBypass })) {
        setBudgetToast(
          `Ticker cap reached (${getBudgetUsage(portfolios, strategies).tickersMax}). Remove a name or ask Admin to raise the free-tier limit.`,
        );
        return "budget";
      }

      setPortfolios((current) =>
        current.map((item) =>
          item.id !== portfolioId
            ? item
            : {
                ...item,
                holdings: [
                  {
                    ticker,
                    shares: 0,
                    avgPrice: 0,
                    openPnlPct: 0,
                    conviction: 0,
                    status: "No Strategy",
                    reason:
                      "Pending research — assign a strategy and log your thesis.",
                    strategyIds: [],
                  },
                  ...item.holdings,
                ],
              },
        ),
      );

      setWatchlist((current) => {
        if (current.some((item) => item.ticker === ticker)) return current;
        return [
          {
            ticker,
            name: `${info.company} · ${info.category}`,
            price: info.lastPrice,
            changePct: 0,
            status: "No Strategy",
            conviction: 0,
            shares: 0,
            avgPrice: 0,
            reason:
              "Pending research — assign a strategy and log your thesis.",
          },
          ...current,
        ];
      });
      if (!watchEditPersistencePaused) {
        markTickerConvictionDirty(portfolioId, ticker);
        setFlags((current) => ({
          ...current,
          tickerConvictionDirtyAt: getTickerConvictionDirtyMap(),
        }));
        void registerPortfolioMarketSymbols([ticker], "add");
        enqueueWeatherTaxonomyHydrate([ticker]);
        void fetchMarketQuotes([ticker]).then((result) => {
          const quote = result?.quotes[ticker];
          if (!quote || !(quote.lastPrice > 0)) return;
          setLiveQuotes({ [ticker]: quote });
          setWatchlist((current) =>
            current.map((item) =>
              item.ticker === ticker
                ? { ...item, price: quote.lastPrice }
                : item,
            ),
          );
          void upsertTickerMarks(
            [
              {
                ticker,
                lastPrice: quote.lastPrice,
                asOf: quote.asOf,
                source: quote.source,
              },
            ],
            userIdRef.current,
          );
        });
      }
      return "added";
    },
    [portfolios, strategies, adminBypass, watchEditPersistencePaused],
  );

  const persistWatchEditMarks = useCallback(() => {
    window.setTimeout(() => {
      const nextPortfolios = portfoliosRef.current;
      const nextStrategies = strategiesRef.current;
      const tickers = [
        ...new Set(
          nextPortfolios.flatMap((portfolio) =>
            portfolio.holdings.map((holding) => holding.ticker),
          ),
        ),
      ];
      void registerPortfolioMarketSymbols(tickers, "replace");
      if (tickers.length === 0 && nextPortfolios.every((p) => (p.cashAvailable ?? 0) <= 0)) {
        return;
      }
      enqueueWeatherTaxonomyHydrate(tickers);
      void fetchMarketQuotes(tickers).then((result) => {
        if (result) setLiveQuotes(result.quotes);
      });
      for (const strategy of nextStrategies) {
        if ((strategy.appliedPortfolioIds ?? []).length > 0) {
          requestImmediateStrategyCheck(strategy.id);
        }
      }
      void persistBookAndConvictionMarks(
        nextPortfolios,
        nextStrategies,
        tickers,
        { ledger: shareFillsRef.current, userId: userIdRef.current },
      );
    }, 0);
  }, [requestImmediateStrategyCheck]);

  const commitCurrentWatchEdit = useCallback(
    async (input: {
      portfolioId: string;
      orders: PendingQtyOrder[];
      cash: PendingCashEdit | null;
      finalCash: number;
      historyRemovalTickers: string[];
    }): Promise<
      | ({ status: "applied" } & CommitCurrentWatchEditResult)
      | { status: "conflict" | "failed" }
    > => {
      const portfolio = portfoliosRef.current.find(
        (item) => item.id === input.portfolioId,
      );
      if (!portfolio) return { status: "failed" };
      const currentStrategies = strategiesRef.current;
      const applied = currentStrategies.filter((strategy) =>
        (strategy.appliedPortfolioIds ?? []).includes(input.portfolioId),
      );
      const appliedStrategyIds = applied.map((strategy) => strategy.id);
      const alignment = measureSync(
        "portfolio-alignment",
        () =>
          computePortfolioAlignment(portfolio, buckets, applied, {
            caller: "order-fill",
          }),
        { caller: "order-fill" },
      );
      const { executeCurrentWatchEdit } = await import(
        "../lib/finance/currentWatchEditWorkflow"
      );
      const outcome = await executeCurrentWatchEdit({
        portfolio,
        strategies: currentStrategies,
        alignment,
        appliedStrategyIds,
        getLastPrice: (ticker) => dataSource.getQuote(ticker)?.lastPrice ?? 0,
        ...input,
        nextId,
        userId:
          isAuthenticated && !demoMode && userIdRef.current
            ? userIdRef.current
            : null,
      });
      if (outcome.status !== "applied") return outcome;
      const nextPortfolio = outcome.portfolio;
      const transactions = outcome.transactions;
      const holdings = nextPortfolio.holdings;
      const durable = outcome.durable;

      const committedPortfolio = {
        ...nextPortfolio,
        revision: durable.revision,
      };
      setPortfolios((current) =>
        current.map((item) =>
          item.id === input.portfolioId ? committedPortfolio : item,
        ),
      );
      const removedHistory = new Set(
        input.historyRemovalTickers.map((ticker) => ticker.toUpperCase()),
      );
      setShareFills((current) => {
        const retained = current.filter(
          (transaction) =>
            transaction.portfolioId !== input.portfolioId ||
            transaction.kind !== "qty" ||
            !removedHistory.has(transaction.ticker.toUpperCase()),
        );
        const next = [...transactions, ...retained];
        shareFillsRef.current = next;
        return next;
      });
      setWatchlist((current) => {
        const byTicker = new Map(current.map((row) => [row.ticker, row]));
        return holdings.map((holding) => {
          const prior = byTicker.get(holding.ticker);
          const info = dataSource.getTickerInfo(holding.ticker);
          return {
            ...(prior ?? {
              ticker: holding.ticker,
              name: info
                ? `${info.company} · ${info.category}`
                : holding.ticker,
              price: info?.lastPrice ?? 0,
            }),
            shares: holding.shares,
            avgPrice: holding.avgPrice,
            changePct: holding.openPnlPct,
            status: holding.status,
            conviction: holding.conviction,
            reason: holding.reason,
          };
        });
      });
      return { status: "applied", ...durable };
    },
    [buckets, demoMode, isAuthenticated, nextId],
  );

  const applyPortfolioTransactionBatch = useCallback(
    async (
      input: CommitPortfolioBatchInput,
    ): Promise<"applied" | "conflict" | "failed"> => {
      try {
        if (!userIdRef.current) return "failed";
        const revision = await commitPortfolioTransactionBatch(
          input,
          userIdRef.current,
        );
        const nextPortfolio = { ...input.portfolio, revision };
        setPortfolios((current) =>
          current.map((portfolio) =>
            portfolio.id === input.portfolioId ? nextPortfolio : portfolio,
          ),
        );
        setShareFills((current) => {
          const ids = new Set(input.transactions.map((row) => row.id));
          const retained = current.filter(
            (row) =>
              !ids.has(row.id) &&
              !(
                input.batch.mode === "replace" &&
                row.portfolioId === input.portfolioId
              ),
          );
          const next = [
            ...input.transactions,
            ...retained,
          ];
          shareFillsRef.current = next;
          return next;
        });
        if (input.batch.mode === "replace" && userIdRef.current) {
          setArchivedPortfolios(
            await loadPortfolioArchives(userIdRef.current),
          );
        }
        return "applied";
      } catch (error) {
        if (error instanceof Error && error.message === "PORTFOLIO_REVISION_CONFLICT") {
          return "conflict";
        }
        return "failed";
      }
    },
    [],
  );

  const loadPortfolioImportBase = useCallback(async (portfolioId: string) => {
    if (!userIdRef.current) {
      const portfolio = portfoliosRef.current.find(
        (item) => item.id === portfolioId,
      );
      return portfolio
        ? {
            portfolio,
            transactions: shareFillsRef.current.filter(
              (transaction) => transaction.portfolioId === portfolioId,
            ),
          }
        : null;
    }
    const workspace = await loadUserWorkspaceSerialized(userIdRef.current);
    const portfolio = workspace.portfolios.find((item) => item.id === portfolioId);
    return portfolio
      ? {
          portfolio,
          transactions: workspace.shareFills.filter(
            (transaction) => transaction.portfolioId === portfolioId,
          ),
        }
      : null;
  }, []);

  const archivePortfolioSource = useCallback(
    async (portfolioId: string): Promise<"archived" | "conflict" | "failed"> => {
      const portfolio = portfoliosRef.current.find((item) => item.id === portfolioId);
      if (!portfolio || !userIdRef.current) return "failed";
      try {
        const archived = await persistPortfolioArchive(
          portfolioId,
          portfolio.revision ?? 0,
          userIdRef.current,
        );
        setPortfolios((current) => current.filter((item) => item.id !== portfolioId));
        setArchivedPortfolios((current) => [
          archived,
          ...current.filter((item) => item.id !== portfolioId),
        ]);
        setStrategies((current) =>
          current.map((strategy) => ({
            ...strategy,
            appliedPortfolioIds: (strategy.appliedPortfolioIds ?? []).filter(
              (id) => id !== portfolioId,
            ),
          })),
        );
        setShareFills((current) => {
          const next = current.filter((row) => row.portfolioId !== portfolioId);
          shareFillsRef.current = next;
          return next;
        });
        return "archived";
      } catch (error) {
        return error instanceof Error && error.message === "PORTFOLIO_REVISION_CONFLICT"
          ? "conflict"
          : "failed";
      }
    },
    [],
  );

  const restorePortfolioSource = useCallback(async (portfolioId: string) => {
    const archived = archivedPortfolios.find((item) => item.id === portfolioId);
    if (!archived?.archiveId || !userIdRef.current) return false;
    try {
      await persistPortfolioRestore(archived.archiveId);
      const workspace = await loadUserWorkspace(userIdRef.current);
      setPortfolios(clonePortfolios(workspace.portfolios));
      setArchivedPortfolios(clonePortfolios(workspace.archivedPortfolios));
      setStrategies(workspace.strategies);
      setShareFills(workspace.shareFills);
      shareFillsRef.current = workspace.shareFills;
      return true;
    } catch {
      return false;
    }
  }, [archivedPortfolios]);

  const deletePortfolioSourcePermanently = useCallback(async (portfolioId: string) => {
    const archived = archivedPortfolios.find((item) => item.id === portfolioId);
    if (!archived?.archiveId) return false;
    try {
      await persistPermanentArchiveDelete(archived.archiveId);
      setArchivedPortfolios((current) => current.filter((item) => item.id !== portfolioId));
      return true;
    } catch {
      return false;
    }
  }, [archivedPortfolios]);

  const archiveTickerHistory = useCallback(
    async (portfolioId: string, ticker: string) => {
      try {
        const archived = await persistTickerHistoryArchive(portfolioId, ticker);
        setShareFills((current) => {
          const next = current.filter(
            (row) =>
              !(
                row.portfolioId === portfolioId &&
                row.kind === "qty" &&
                row.ticker === ticker
              ),
          );
          shareFillsRef.current = next;
          return next;
        });
        return archived;
      } catch {
        return null;
      }
    },
    [],
  );

  const restoreTickerHistory = useCallback(async (archiveId: number) => {
    if (!userIdRef.current) return false;
    try {
      await persistTickerHistoryRestore(archiveId);
      const workspace = await loadUserWorkspace(userIdRef.current);
      setShareFills(workspace.shareFills);
      shareFillsRef.current = workspace.shareFills;
      return true;
    } catch {
      return false;
    }
  }, []);

  const removeTickerFromPortfolio = useCallback(
    (portfolioId: string, ticker: string) => {
      setPortfolios((current) =>
        current.map((item) =>
          item.id !== portfolioId
            ? item
            : {
                ...item,
                holdings: item.holdings.filter(
                  (holding) => holding.ticker !== ticker,
                ),
              },
        ),
      );
      if (true) {  // mirror watchlist for all Beta portfolios
        setWatchlist((current) => {
          const next = current.filter((item) => item.ticker !== ticker);
          if (ticker === selectedTicker) {
            setSelectedTicker(next[0]?.ticker ?? "");
          }
          return next;
        });
      }
    },
    [selectedTicker],
  );

  const createPortfolioSource = useCallback(
    (label: string, type: Portfolio["type"]): string | null => {
      const trimmed = label.trim();
      if (!trimmed) return null;
      const id = nextId(type === "watchlist" ? "watch" : "port");
      setPortfolios((current) => [
        ...current,
        {
          id,
          label: trimmed,
          type,
          cashAvailable: 0,
          holdings: [],
          createdAt: new Date().toISOString(),
          revision: 0,
        },
      ]);
      return id;
    },
    [nextId],
  );

  const captureWatchEditSnapshot = useCallback(
    (portfolioId: string): WatchEditSnapshot | null => {
      const portfolio = portfolios.find((item) => item.id === portfolioId);
      if (!portfolio) return null;
      const tickerExclusionsByStrategy: Record<string, string[]> = {};
      const appliedPortfolioIdsByStrategy: Record<string, string[]> = {};
      for (const strategy of strategies) {
        tickerExclusionsByStrategy[strategy.id] = [
          ...(strategy.tickerExclusions?.[portfolioId] ?? []),
        ];
        appliedPortfolioIdsByStrategy[strategy.id] = [
          ...(strategy.appliedPortfolioIds ?? []),
        ];
      }
      return {
        portfolioId,
        revision: portfolio.revision ?? 0,
        holdings: cloneHoldings(portfolio.holdings),
        cashAvailable: portfolio.cashAvailable ?? 0,
        tickerExclusionsByStrategy,
        appliedPortfolioIdsByStrategy,
        transactions: shareFillsRef.current
          .filter((transaction) => transaction.portfolioId === portfolioId)
          .map((transaction) => ({ ...transaction })),
      };
    },
    [portfolios, strategies],
  );

  const restoreWatchEditSnapshot = useCallback(
    (snapshot: WatchEditSnapshot) => {
      const {
        portfolioId,
        revision,
        holdings,
        cashAvailable,
        tickerExclusionsByStrategy,
        appliedPortfolioIdsByStrategy,
        transactions,
      } = snapshot;
      const nextHoldings = cloneHoldings(holdings);

      setPortfolios((current) =>
        current.map((item) =>
          item.id !== portfolioId
            ? item
            : {
                ...item,
                revision,
                holdings: nextHoldings,
                cashAvailable:
                  item.type === "watchlist"
                    ? item.cashAvailable
                    : cashAvailable,
              },
        ),
      );

      setStrategies((current) =>
        current.map((strategy) => {
          if (!(strategy.id in tickerExclusionsByStrategy)) return strategy;
          const nextList = tickerExclusionsByStrategy[strategy.id] ?? [];
          const exclusions = { ...(strategy.tickerExclusions ?? {}) };
          if (nextList.length === 0) delete exclusions[portfolioId];
          else exclusions[portfolioId] = [...nextList];
          return {
            ...strategy,
            tickerExclusions: exclusions,
            appliedPortfolioIds: [
              ...(appliedPortfolioIdsByStrategy[strategy.id] ?? []),
            ],
          };
        }),
      );

      setShareFills((current) => {
        const next = [
          ...transactions.map((transaction) => ({ ...transaction })),
          ...current.filter(
            (transaction) => transaction.portfolioId !== portfolioId,
          ),
        ];
        shareFillsRef.current = next;
        return next;
      });

      if (true) {  // mirror watchlist for all Beta portfolios
        setWatchlist((current) => {
          const byTicker = new Map(current.map((row) => [row.ticker, row]));
          return nextHoldings.map((holding) => {
            const prior = byTicker.get(holding.ticker);
            if (prior) {
              return {
                ...prior,
                shares: holding.shares,
                avgPrice: holding.avgPrice,
                changePct: holding.openPnlPct,
                status: holding.status,
                conviction: holding.conviction,
                reason: holding.reason,
              };
            }
            const info = dataSource.getTickerInfo(holding.ticker);
            return {
              ticker: holding.ticker,
              name: info
                ? `${info.company} · ${info.category}`
                : holding.ticker,
              price: info?.lastPrice ?? 0,
              changePct: holding.openPnlPct,
              status: holding.status,
              conviction: holding.conviction,
              shares: holding.shares,
              avgPrice: holding.avgPrice,
              reason: holding.reason,
            };
          });
        });
      }
    },
    [],
  );

  const recordWatchEditStrategyHistory = useCallback(
    (snapshot: WatchEditSnapshot) => {
      for (const strategy of strategiesRef.current) {
        const beforeExclusions =
          snapshot.tickerExclusionsByStrategy[strategy.id];
        const beforeApplied =
          snapshot.appliedPortfolioIdsByStrategy[strategy.id];
        if (!beforeExclusions || !beforeApplied) continue;
        const exclusions = { ...(strategy.tickerExclusions ?? {}) };
        if (beforeExclusions.length === 0) delete exclusions[snapshot.portfolioId];
        else exclusions[snapshot.portfolioId] = [...beforeExclusions];
        const previous = {
          ...strategy,
          tickerExclusions: exclusions,
          appliedPortfolioIds: [...beforeApplied],
        };
        if (
          JSON.stringify(previous.tickerExclusions ?? {}) !==
            JSON.stringify(strategy.tickerExclusions ?? {}) ||
          JSON.stringify([...beforeApplied].sort()) !==
            JSON.stringify([...(strategy.appliedPortfolioIds ?? [])].sort())
        ) {
          scheduleStrategyHistory(previous, strategy);
        }
      }
    },
    [],
  );

  const createStrategy = useCallback(() => {
    const id = nextId("strategy");
    // New blank strategies start with empty rule sets, the built-in
    // "All Active Chips" system tag per category, and default category weights
    // — the same shape every strategy carries (see docs/strategy-forge.md).
    const strategy: Strategy = {
      id,
      name: "New Strategy",
      description: "Describe when this strategy applies and how it behaves.",
      isDefault: false,
      enabled: true,
      timeframe: [],
      tags: [],
      decisionSignals: [],
      exitLogic: [],
      thesisDescription: "",
      rules: [],
      ruleTags: buildSystemTags(id),
      categoryWeights: { ...DEFAULT_CATEGORY_WEIGHTS },
      appliedPortfolioIds: [],
      checkInterval: "1D",
      technicalsInterval: "1D",
    };
    setStrategies((current) => [...current, strategy]);
    scheduleStrategyHistory(null, strategy);
    return id;
  }, [nextId]);

  const updateStrategy = useCallback((id: string, patch: Partial<Strategy>) => {
    const currentStrategy = strategiesRef.current.find(
      (strategy) => strategy.id === id,
    );
    if (!currentStrategy) return;
    const safePatch = sanitizeStrategyPatch(currentStrategy, patch);
    if (Object.keys(safePatch).length === 0) return;
    scheduleStrategyHistory(currentStrategy, { ...currentStrategy, ...safePatch });
    setStrategies((current) =>
      current.map((strategy) => {
        if (strategy.id !== id) return strategy;
        const safe = sanitizeStrategyPatch(strategy, patch);
        if (Object.keys(safe).length === 0) return strategy;
        return { ...strategy, ...safe };
      }),
    );
    if (strategyPatchNeedsImmediateCheck(safePatch)) {
      markStrategyConvictionDirty(id);
      requestImmediateStrategyCheck(id);
    }
  }, [requestImmediateStrategyCheck]);

  const deleteStrategy = useCallback((id: string) => {
    const currentStrategy = strategiesRef.current.find(
      (strategy) => strategy.id === id && !strategy.isDefault,
    );
    if (currentStrategy) {
      scheduleStrategyHistory(currentStrategy, {
        ...currentStrategy,
        appliedPortfolioIds: [],
      });
    }
    setStrategies((current) =>
      current.filter((strategy) => {
        if (strategy.id !== id) return true;
        return Boolean(strategy.isDefault); // never delete defaults
      }),
    );
  }, []);

  const duplicateStrategy = useCallback(
    (id: string) => {
      const source = strategies.find((strategy) => strategy.id === id);
      if (!source) return undefined;
      const newId = nextId("strategy");
      // Deep-copy rules + tags so edits to the copy never bleed into the source.
      const copy: Strategy = {
        ...source,
        id: newId,
        name: `${source.name} (Copy)`,
        isDefault: false,
        rules: (source.rules ?? []).map((chip) => ({ ...chip })),
        ruleTags: (source.ruleTags ?? []).map((tag) => ({
          ...tag,
          chipIds: [...tag.chipIds],
        })),
        trimZoneRules: (source.trimZoneRules ?? []).map((chip) => ({ ...chip })),
        trimZoneTags: (source.trimZoneTags ?? []).map((tag) => ({
          ...tag,
          chipIds: [...tag.chipIds],
        })),
        addZoneRules: (source.addZoneRules ?? []).map((chip) => ({ ...chip })),
        addZoneTags: (source.addZoneTags ?? []).map((tag) => ({
          ...tag,
          chipIds: [...tag.chipIds],
        })),
        goToCashRules: (source.goToCashRules ?? []).map((chip) => ({ ...chip })),
        goToCashTags: (source.goToCashTags ?? []).map((tag) => ({
          ...tag,
          chipIds: [...tag.chipIds],
        })),
        categoryWeights: source.categoryWeights
          ? { ...source.categoryWeights }
          : { ...DEFAULT_CATEGORY_WEIGHTS },
        categoryEnabled: source.categoryEnabled
          ? { ...source.categoryEnabled }
          : undefined,
        // A fresh copy starts unapplied — the user applies it explicitly.
        appliedPortfolioIds: [],
      };
      setStrategies((current) => [...current, copy]);
      scheduleStrategyHistory(null, copy);
      markStrategyConvictionDirty(newId);
      return newId;
    },
    [strategies, nextId],
  );

  const resetStrategy = useCallback((id: string) => {
    const original = DEFAULT_STRATEGIES.find((strategy) => strategy.id === id);
    if (!original) return;
    setStrategies((current) =>
      current.map((strategy) => {
        if (strategy.id !== id) return strategy;
        // Defaults: re-seed body but keep apply prefs.
        return {
          ...original,
          appliedPortfolioIds: strategy.appliedPortfolioIds ?? [],
          tickerExclusions: strategy.tickerExclusions ?? {},
        };
      }),
    );
    const current = strategiesRef.current.find((strategy) => strategy.id === id);
    if (current) {
      scheduleStrategyHistory(current, {
        ...original,
        appliedPortfolioIds: current.appliedPortfolioIds ?? [],
        tickerExclusions: current.tickerExclusions ?? {},
      });
    }
    markStrategyConvictionDirty(id);
    requestImmediateStrategyCheck(id);
  }, [requestImmediateStrategyCheck]);

  const saveChipToLibrary = useCallback(
    (chip: RuleChip) => {
      if (!canAddChips(portfolios, strategies, 1, { adminBypass })) {
        setBudgetToast(
          `Chip budget reached (${getBudgetUsage(portfolios, strategies).chipsMax} active chips across strategies).`,
        );
        return;
      }
      const libraryChip: RuleChip = {
        ...chip,
        id: nextId("lib"),
      };
      setChipLibrary((current) => [...current, libraryChip]);
    },
    [nextId, portfolios, strategies, adminBypass],
  );

  const removeChipFromLibrary = useCallback((chipId: string) => {
    setChipLibrary((current) => current.filter((chip) => chip.id !== chipId));
  }, []);

  const updateChipInLibrary = useCallback(
    (chipId: string, patch: Partial<RuleChip>, propagate: boolean) => {
      setChipLibrary((current) =>
        current.map((chip) => (chip.id === chipId ? { ...chip, ...patch } : chip)),
      );
      if (!propagate) return;
      const affectedStrategyIds = strategiesRef.current
        .filter((strategy) =>
          (strategy.rules ?? []).some(
            (chip) => chip.libraryChipId === chipId,
          ),
        )
        .map((strategy) => strategy.id);
      setStrategies((current) =>
        current.map((strategy) => ({
          ...strategy,
          rules: (strategy.rules ?? []).map((chip) =>
            chip.libraryChipId === chipId ? { ...chip, ...patch } : chip,
          ),
        })),
      );
      for (const strategyId of affectedStrategyIds) {
        markStrategyConvictionDirty(strategyId);
        requestImmediateStrategyCheck(strategyId);
      }
    },
    [requestImmediateStrategyCheck],
  );

  const setTickerEnabledForStrategy = useCallback(
    (portfolioId: string, ticker: string, strategyId: string, enabled: boolean) => {
      setPortfolios((current) =>
        current.map((portfolio) => {
          if (portfolio.id !== portfolioId) return portfolio;
          return {
            ...portfolio,
            holdings: portfolio.holdings.map((holding) => {
              if (holding.ticker !== ticker) return holding;
              const nextIds = new Set(holding.strategyIds);
              if (enabled) nextIds.add(strategyId);
              else nextIds.delete(strategyId);
              return { ...holding, strategyIds: Array.from(nextIds) };
            }),
          };
        }),
      );

      setStrategies((current) =>
        current.map((strategy) => {
          if (strategy.id !== strategyId) return strategy;
          let next = strategy;
          // Enabling a ticker on source P also ensures P is on the apply list
          // (invariant: holdings.strategyIds ⊆ appliedPortfolioIds).
          if (enabled) next = withPortfolioApplied(next, portfolioId);
          if (isDefaultStrategyId(strategyId)) return next;
          const exclusions = { ...(next.tickerExclusions ?? {}) };
          const tickers = new Set(exclusions[portfolioId] ?? []);
          if (enabled) tickers.delete(ticker);
          else tickers.add(ticker);
          if (tickers.size === 0) delete exclusions[portfolioId];
          else exclusions[portfolioId] = Array.from(tickers).sort();
          return { ...next, tickerExclusions: exclusions };
        }),
      );
      if (enabled && !watchEditPersistencePaused) {
        markTickerConvictionDirty(portfolioId, ticker);
        markStrategyConvictionDirty(strategyId);
        setFlags((current) => ({
          ...current,
          tickerConvictionDirtyAt: getTickerConvictionDirtyMap(),
        }));
        void registerPortfolioMarketSymbols([ticker], "add");
        requestImmediateStrategyCheck(strategyId);
      }
    },
    [requestImmediateStrategyCheck, watchEditPersistencePaused],
  );

  const validServerLatestResults = useMemo(
    () =>
      filterCurrentStrategyCheckResults(
        serverLatestResults,
        serverCheckSchedules,
      ),
    [serverCheckSchedules, serverLatestResults],
  );

  // Recomputed only when the strategies or buckets change (data snapshots are
  // static). Each portfolio's per-ticker + aggregate alignment in one pass.
  const alignmentByPortfolio = useMemo(() => {
    const map: Record<string, PortfolioAlignment> = {};
    const combinedByScope = new Map(
      serverCombinedResults.map((row) => [
        `${row.portfolioId}|${row.ticker}`,
        row,
      ]),
    );
    for (const portfolio of portfolios) {
      const clientAlignment = getPortfolioAlignmentCached(
        portfolio,
        buckets,
        strategies,
        { revision: scoreRevision, caller: "render" },
      );
      if (serverScoringMode !== "authoritative") {
        map[portfolio.id] = clientAlignment;
        continue;
      }
      const byTicker: PortfolioAlignment["byTicker"] = {};
      const slices: Array<{
        marketValue: number;
        conviction: number;
        categories: StockAlignment["categories"];
      }> = [];
      const portfolioFlags: StatusType[] = [];
      for (const holding of portfolio.holdings) {
        const applicable = strategiesForHolding(
          holding,
          portfolio.id,
          strategies,
        );
        if (applicable.length === 0) continue;
        const strategyIds = applicable.map((strategy) => strategy.id);
        const row = combinedByScope.get(
          `${portfolio.id}|${holding.ticker.toUpperCase()}`,
        );
        if (
          !row ||
          !combinedResultMatchesScope(row, strategyIds, serverCheckSchedules)
        ) continue;
        const alignment = stockAlignmentFromServer(row);
        if (!alignment) continue;
        byTicker[holding.ticker] = {
          ticker: holding.ticker,
          bucketId: `server-${strategyIds.join("+")}`,
          bucketName: applicable.map((strategy) => strategy.name).join(" + "),
          conviction: alignment.conviction,
          status: alignment.status,
          resolved: alignment.resolved,
          alignment,
        };
        const marketValue = Number(row.payload.marketValue);
        if (Number.isFinite(marketValue) && marketValue > 0) {
          slices.push({
            marketValue,
            conviction: alignment.conviction,
            categories: alignment.categories,
          });
        }
        if (alignment.resolved.categoryFlags.includes("Go to Cash")) {
          portfolioFlags.push("Go to Cash");
        }
      }
      const portfolioResolved = resolveAggregatedStatus(slices, {
        hasStrategy: Object.keys(byTicker).length > 0,
        zoneFlags: portfolioFlags,
        zoneSurface: "portfolio",
      });
      map[portfolio.id] = {
        byTicker,
        byBucket: clientAlignment.byBucket,
        portfolio: {
          conviction: portfolioResolved.conviction,
          status: portfolioResolved.primary,
          resolved: portfolioResolved,
        },
      };
    }
    return map;
    // scoreRevision: score inputs/readiness changed; taxonomy/budgets do not rescore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    portfolios,
    buckets,
    strategies,
    scoreRevision,
    validServerLatestResults,
    serverCombinedResults,
    serverCheckSchedules,
    serverScoringMode,
  ]);

  useEffect(() => {
    if (serverScoringMode !== "shadow") return;
    const cycleAsOf = getMarketCycleMeta()?.cycleAsOf;
    if (!cycleAsOf) return;
    for (const result of validServerLatestResults) {
      if (result.cycleAsOf !== cycleAsOf) continue;
      const portfolio = portfolios.find((item) => item.id === result.portfolioId);
      const strategy = strategies.find((item) => item.id === result.strategyId);
      if (!portfolio || !strategy) continue;
      const local = getPortfolioAlignmentCached(
        portfolio,
        buckets,
        [strategy],
        { revision: scoreRevision, caller: "server-shadow" },
      ).byTicker[result.ticker];
      if (
        !local ||
        local.conviction !== result.conviction ||
        local.status !== result.status
      ) {
        console.warn(
          JSON.stringify({
            event: "conviction_score_parity_mismatch",
            portfolioId: result.portfolioId,
            strategyId: result.strategyId,
            ticker: result.ticker,
            cycleAsOf,
            server: { conviction: result.conviction, status: result.status },
            client: local
              ? { conviction: local.conviction, status: local.status }
              : null,
          }),
        );
      }
    }
  }, [
    buckets,
    portfolios,
    scoreRevision,
    serverScoringMode,
    strategies,
    validServerLatestResults,
  ]);

  const lastDataPullAtByStrategyId = useMemo(
    () => getLastDataPullAtMap(),
    [marketGeneration],
  );

  const getWatchPullStamp = useCallback(
    (
      appliedStrategyIds: string[],
      focusedStrategyId?: string | null,
    ): string | null => {
      const cycleMeta = getMarketCycleMeta();
      const cycleLast =
        cycleMeta?.cycleAsOf ?? cycleMeta?.publishedAt ?? undefined;
      if (focusedStrategyId) {
        return formatPullStamp(
          getLastDataPullAt(focusedStrategyId) ?? cycleLast,
        );
      }
      const stamps = appliedStrategyIds
        .map((id) => getLastDataPullAt(id))
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) => Date.parse(iso))
        .filter((ms) => !Number.isNaN(ms));
      if (stamps.length === 0) return formatPullStamp(cycleLast);
      return formatPullStamp(new Date(Math.max(...stamps)).toISOString());
    },
    [marketGeneration],
  );

  const getWatchCheckSchedule = useCallback(
    (
      appliedStrategyIds: string[],
      focusedStrategyId?: string | null,
    ): {
      lastAt: string | null;
      nextAt: string;
      waitingOnCycle: boolean;
      checkInProgress: boolean;
      applyAt: string;
    } | null => {
      const ids = focusedStrategyId
        ? [focusedStrategyId]
        : appliedStrategyIds;
      if (ids.length === 0) return null;
      const cycleMeta = getMarketCycleMeta();
      const cycleLast =
        cycleMeta?.cycleAsOf ?? cycleMeta?.publishedAt ?? undefined;
      const now = Date.now();
      if (serverScoringMode === "authoritative") {
        const schedules = serverCheckSchedules.filter((row) =>
          ids.includes(row.strategyId),
        );
        if (schedules.length > 0) {
          const rows = schedules.map((schedule) => {
            const state = serverCheckState.find(
              (row) =>
                row.strategyId === schedule.strategyId &&
                row.cadence === schedule.cadence,
            );
            return {
              lastAt: state?.lastCycleAsOf ?? null,
              nextAt: schedule.nextDueAt,
            };
          });
          const lastStamps = rows
            .flatMap((row) => (row.lastAt ? [Date.parse(row.lastAt)] : []))
            .filter(Number.isFinite);
          const nextStamps = rows
            .map((row) => Date.parse(row.nextAt))
            .filter(Number.isFinite);
          const lastAt =
            lastStamps.length > 0
              ? new Date(Math.max(...lastStamps)).toISOString()
              : null;
          const nextAt =
            nextStamps.length > 0
              ? new Date(Math.min(...nextStamps)).toISOString()
              : new Date(now + 60 * 60_000).toISOString();
          const checkInProgress = nextStamps.some((stamp) => stamp <= now);
          const cycleApplyMs = cycleMeta?.nextCycleAt
            ? Date.parse(cycleMeta.nextCycleAt)
            : NaN;
          const applyAt =
            checkInProgress && Number.isFinite(cycleApplyMs) && cycleApplyMs > now
              ? new Date(cycleApplyMs).toISOString()
              : checkInProgress
                ? new Date(
                    Math.floor(now / (60 * 60_000)) * 60 * 60_000 +
                      60 * 60_000,
                  ).toISOString()
                : nextAt;
          return {
            lastAt,
            nextAt,
            waitingOnCycle: rows.some((row) => !row.lastAt),
            checkInProgress,
            applyAt,
          };
        }
      }
      const rows = ids.flatMap((strategyId) => {
        const strategy = strategies.find((item) => item.id === strategyId);
        if (!strategy) return [];
        const lastAt =
          getLastDataPullAt(strategyId) ?? cycleLast ?? null;
        return [
          {
            lastAt,
            nextAt: nextStrategyCheckAt(strategy, lastAt, now),
            overdueAt: overdueStrategyCheckAt(strategy, lastAt, now),
          },
        ];
      });
      if (rows.length === 0) return null;
      const lastStamps = rows
        .map((row) => row.lastAt)
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) => Date.parse(iso))
        .filter((ms) => !Number.isNaN(ms));
      const lastAt =
        lastStamps.length > 0
          ? new Date(Math.max(...lastStamps)).toISOString()
          : null;
      const nextAt = new Date(
        Math.min(...rows.map((row) => Date.parse(row.nextAt))),
      ).toISOString();
      const overdueStamps = rows
        .map((row) => row.overdueAt)
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) => Date.parse(iso));
      const checkInProgress = overdueStamps.length > 0;
      const waitingOnCycle = ids.some(
        (strategyId) => !getLastDataPullAt(strategyId),
      );
      const cycleApplyMs = cycleMeta?.nextCycleAt
        ? Date.parse(cycleMeta.nextCycleAt)
        : NaN;
      const HOUR_MS = 60 * 60_000;
      // In-progress countdown = when this due check should apply (next market
      // cycle publish), never the next future cadence wall (e.g. Monday).
      const applyAt = checkInProgress
        ? Number.isFinite(cycleApplyMs) && cycleApplyMs > now
          ? new Date(cycleApplyMs).toISOString()
          : new Date(Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS).toISOString()
        : nextAt;
      return { lastAt, nextAt, waitingOnCycle, checkInProgress, applyAt };
    },
    [
      marketGeneration,
      strategies,
      serverCheckSchedules,
      serverCheckState,
      serverScoringMode,
    ],
  );

  const isConvictionScoreReadyForWatch = useCallback(
    (portfolioId: string, ticker: string, strategyIds: string[]) => {
      if (serverScoringMode === "authoritative") {
        const symbol = ticker.toUpperCase();
        const combined = serverCombinedResults.find(
          (row) => row.portfolioId === portfolioId && row.ticker === symbol,
        );
        if (
          !combined ||
          !combinedResultMatchesScope(
            combined,
            strategyIds,
            serverCheckSchedules,
          )
        ) return false;
      }
      return isConvictionScoreReady(portfolioId, ticker, strategyIds);
    },
    [
      marketGeneration,
      serverCombinedResults,
      serverCheckSchedules,
      serverScoringMode,
    ],
  );

  const getConvictionPresentation = useCallback(
    (
      portfolioId: string,
      ticker: string,
      strategyIds: string[],
    ): ConvictionRunPresentation => {
      const scoreReady = isConvictionScoreReadyForWatch(
        portfolioId,
        ticker,
        strategyIds,
      );
      const symbol = ticker.toUpperCase();
      const relevant = serverCheckRuns.filter(
        (run) =>
          strategyIds.includes(run.strategyId) &&
          (run.affectedTickers.length === 0 ||
            run.affectedTickers.includes(symbol)),
      );
      const latest = relevant[0];
      const stateError = serverCheckState.find(
        (row) =>
          strategyIds.includes(row.strategyId) && row.lastError != null,
      );
      return presentConvictionRun({
        dbStatus: latest?.status ?? "pending",
        attemptCount: latest?.attemptCount,
        error: latest?.error ?? stateError?.lastError ?? null,
        errorCategory: (latest?.errorCategory ?? undefined) as
          | ConvictionErrorCategory
          | undefined,
        affectedTickers: latest?.affectedTickers ?? [symbol],
        nextRetryAt: latest?.nextRetryAt,
        scoreReady,
        hasHistoricalResult: serverLatestResults.some(
          (row) =>
            row.portfolioId === portfolioId &&
            row.ticker === symbol &&
            strategyIds.includes(row.strategyId),
        ),
        scheduledFor: latest?.scheduledFor ?? null,
      });
    },
    [
      isConvictionScoreReadyForWatch,
      serverCheckRuns,
      serverCheckState,
      serverLatestResults,
    ],
  );

  const getPortfolioAlignment = useCallback(
    (portfolioId: string): PortfolioAlignment =>
      alignmentByPortfolio[portfolioId] ?? {
        byTicker: {},
        byBucket: {},
        portfolio: {
          conviction: 0,
          status: "Watch",
          resolved: resolveStatus(0, [], { hasStrategy: false }),
        },
      },
    [alignmentByPortfolio],
  );

  const getStockAlignment = useCallback(
    (portfolioId: string, ticker: string): TickerAlignment | undefined =>
      alignmentByPortfolio[portfolioId]?.byTicker[ticker],
    [alignmentByPortfolio],
  );

  // Per-ticker strategy assignment **within one portfolio** — holdings[].strategyIds
  // (defaults) plus applied custom strategies for that portfolio only. Used by
  // Current Watch drill-in and dashboard chips so sources never leak across each other.
  const getAppliedStrategiesForTicker = useCallback(
    (ticker: string, portfolioId: string): Strategy[] => {
      const portfolio = portfolios.find((item) => item.id === portfolioId);
      const holding = portfolio?.holdings.find((item) => item.ticker === ticker);
      if (!holding) return [];
      return strategiesForHolding(holding, portfolioId, strategies);
    },
    [portfolios, strategies],
  );

  // A strategy's OWN rule-chip pass/fail/no-data breakdown for a ticker,
  // independent of buckets — lets the Watch summary show, per applied
  // strategy, exactly which chips are calculating vs. excluded. Supplies
  // openPnlPct + portfolio weightPct from the selected portfolio so Layer 3
  // overlays (e.g. Add Zone on weight) match the list-row alignment. holdingDays
  // stays unset here (bucket entry-date specific).
  const getStrategyChipBreakdown = useCallback(
    (strategyId: string, ticker: string, portfolioId?: string): StockAlignment | undefined => {
      const strategy = strategies.find((item) => item.id === strategyId);
      if (!strategy) return undefined;
      const portfolio = portfolioId
        ? portfolios.find((item) => item.id === portfolioId)
        : undefined;
      const holding = portfolio?.holdings.find((item) => item.ticker === ticker);
      if (serverScoringMode === "authoritative" && portfolioId) {
        const row = validServerLatestResults.find(
          (result) =>
            result.portfolioId === portfolioId &&
            result.strategyId === strategyId &&
            result.ticker === ticker.toUpperCase(),
        );
        return row ? stockAlignmentFromServer(row) ?? undefined : undefined;
      }
      const priceOf = (symbol: string): number => {
        const live = getLiveQuote(symbol);
        if (live && live.lastPrice > 0) return live.lastPrice;
        const info = dataSource.getTickerInfo(symbol)?.lastPrice;
        return info && info > 0 ? info : 0;
      };
      const weightPct = portfolio
        ? portfolioWeightPct(portfolio.holdings, ticker, priceOf)
        : undefined;
      const mark = priceOf(ticker);
      const ctx: MetricContext = {
        fundamentals: dataSource.getFundamentals(ticker),
        technicals: dataSource.getTechnicals(ticker),
        technicalsByTimeframe: dataSource.getTechnicalsByTimeframe(ticker),
        market: dataSource.getMarketContext(),
        openPnlPct:
          holding && holding.avgPrice > 0 && mark > 0
            ? openPnlPercent(mark, holding.avgPrice)
            : undefined,
        weightPct,
      };
      const allowRuleOverlays =
        portfolioId != null &&
        isConvictionScoreReady(portfolioId, ticker, [strategyId]);
      return scoreStock(strategy, ctx, {
        hasStrategy: true,
        allowRuleOverlays,
      });
    },
    // marketGeneration: live quotes change weightPct / openPnlPct / overlays
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      strategies,
      portfolios,
      marketGeneration,
      validServerLatestResults,
      serverScoringMode,
    ],
  );

  // Overlay computed conviction/status onto the default portfolio's watchlist so
  // the Home/dashboard surfaces reflect the Forge engine (not the seed numbers).
  const decoratedWatchlist = useMemo<WatchlistItem[]>(() => {
    const byTicker: Record<string, TickerAlignment> = {};
    for (const alignment of Object.values(alignmentByPortfolio)) {
      Object.assign(byTicker, alignment.byTicker);
    }
    return watchlist.map((item) => {
      const aligned = byTicker[item.ticker];
      const livePrice = dataSource.getTickerInfo(item.ticker)?.lastPrice ?? 0;
      const withPrice = { ...item, price: livePrice };
      return aligned
        ? {
            ...withPrice,
            conviction: aligned.conviction,
            status: aligned.status,
            resolved: aligned.resolved,
          }
        : withPrice;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- marketGeneration: live quotes
  }, [watchlist, alignmentByPortfolio, marketGeneration]);

  const addLog = useCallback(
    (ticker: string, draft: LogDraft) => {
      const entry: LogEntry = {
        id: nextId("log"),
        title: draft.title,
        note: draft.note,
        strategy: draft.strategy,
        timestamp: currentTimestamp(),
      };
      setLogsByTicker((current) => ({
        ...current,
        [ticker]: [entry, ...(current[ticker] ?? [])],
      }));
    },
    [nextId],
  );

  const updateLog = useCallback(
    (ticker: string, id: string, draft: LogDraft) => {
      setLogsByTicker((current) => ({
        ...current,
        [ticker]: (current[ticker] ?? []).map((entry) =>
          entry.id === id
            ? {
                ...entry,
                title: draft.title,
                note: draft.note,
                strategy: draft.strategy,
              }
            : entry,
        ),
      }));
    },
    [],
  );

  const deleteLog = useCallback((ticker: string, id: string) => {
    setLogsByTicker((current) => ({
      ...current,
      [ticker]: (current[ticker] ?? []).filter((entry) => entry.id !== id),
    }));
  }, []);

  const selectedItem = useMemo(
    () => decoratedWatchlist.find((item) => item.ticker === selectedTicker),
    [decoratedWatchlist, selectedTicker],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      isAuthenticated,
      demoMode,
      needsOnboarding,
      captainName,
      userProfile,
      needsLegalAck,
      acknowledgeLegal,
      needsOnboardingModal: isAuthenticated && !flags.onboardingSeen,
      onboardingModalOpen:
        (isAuthenticated && !flags.onboardingSeen) || onboardingReopened,
      openOnboardingModal,
      dismissOnboardingModal,
      flags,
      markBadgeToastsSeen,
      markWeatherReaderLayer,
      completeBetaSignIn,
      signIn,
      signUp,
      continueAsDemo,
      completeOnboarding,
      signOut,
      budgetToast,
      clearBudgetToast,
      cadenceToast,
      clearCadenceToast,
      previewStrategyCheckToast,
      captain,
      updateCaptain,
      activePage,
      setActivePage,
      watchlist: decoratedWatchlist,
      addTicker,
      removeTicker,
      selectedTicker,
      selectTicker: setSelectedTicker,
      selectedItem,
      selectedPortfolioId,
      setSelectedPortfolioId,
      watchStrategyScopeId,
      setWatchStrategyScopeId,
      strategies,
      createStrategy,
      updateStrategy,
      deleteStrategy,
      duplicateStrategy,
      resetStrategy,
      chipLibrary,
      saveChipToLibrary,
      removeChipFromLibrary,
      updateChipInLibrary,
      buckets,
      portfolios,
      archivedPortfolios,
      setWatchEditPersistencePaused,
      archivePortfolioSource,
      restorePortfolioSource,
      deletePortfolioSourcePermanently,
      archiveTickerHistory,
      restoreTickerHistory,
      setTickerEnabledForStrategy,
      addTickerToPortfolio,
      commitCurrentWatchEdit,
      applyPortfolioTransactionBatch,
      loadPortfolioImportBase,
      persistWatchEditMarks,
      shareFills,
      removeTickerFromPortfolio,
      createPortfolioSource,
      captureWatchEditSnapshot,
      restoreWatchEditSnapshot,
      recordWatchEditStrategyHistory,
      getPortfolioAlignment,
      getStockAlignment,
      getAppliedStrategiesForTicker,
      getStrategyChipBreakdown,
      lastDataPullAtByStrategyId,
      getWatchPullStamp,
      getWatchCheckSchedule,
      isConvictionScoreReady: isConvictionScoreReadyForWatch,
      getConvictionPresentation,
      marketLoading,
      marketError,
      refreshLiveMarket,
      requestImmediateStrategyCheck,
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
    }),
    [
      isAuthenticated,
      demoMode,
      needsOnboarding,
      captainName,
      userProfile,
      needsLegalAck,
      acknowledgeLegal,
      flags,
      onboardingReopened,
      openOnboardingModal,
      dismissOnboardingModal,
      markBadgeToastsSeen,
      markWeatherReaderLayer,
      completeBetaSignIn,
      signIn,
      signUp,
      continueAsDemo,
      completeOnboarding,
      signOut,
      budgetToast,
      clearBudgetToast,
      cadenceToast,
      clearCadenceToast,
      previewStrategyCheckToast,
      captain,
      updateCaptain,
      activePage,
      decoratedWatchlist,
      addTicker,
      removeTicker,
      selectedTicker,
      selectedItem,
      selectedPortfolioId,
      watchStrategyScopeId,
      strategies,
      createStrategy,
      updateStrategy,
      deleteStrategy,
      duplicateStrategy,
      resetStrategy,
      chipLibrary,
      saveChipToLibrary,
      removeChipFromLibrary,
      updateChipInLibrary,
      buckets,
      portfolios,
      setTickerEnabledForStrategy,
      addTickerToPortfolio,
      applyPortfolioTransactionBatch,
      loadPortfolioImportBase,
      persistWatchEditMarks,
      commitCurrentWatchEdit,
      shareFills,
      removeTickerFromPortfolio,
      createPortfolioSource,
      captureWatchEditSnapshot,
      restoreWatchEditSnapshot,
      recordWatchEditStrategyHistory,
      getPortfolioAlignment,
      getStockAlignment,
      getAppliedStrategiesForTicker,
      getStrategyChipBreakdown,
      lastDataPullAtByStrategyId,
      getWatchPullStamp,
      getWatchCheckSchedule,
      isConvictionScoreReadyForWatch,
      getConvictionPresentation,
      marketLoading,
      marketError,
      refreshLiveMarket,
      requestImmediateStrategyCheck,
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
    ],
  );
  const stateStoreRef = useRef<AppStateStore | null>(null);
  if (!stateStoreRef.current) {
    stateStoreRef.current = { value, listeners: new Set() };
  } else {
    stateStoreRef.current.value = value;
  }
  useEffect(() => {
    stateStoreRef.current?.listeners.forEach((listener) => listener());
  }, [value]);

  if (!authReady) {
    return null;
  }

  return (
    <AppStateStoreContext.Provider value={stateStoreRef.current}>
      {children}
    </AppStateStoreContext.Provider>
  );
}

function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    left == null ||
    typeof right !== "object" ||
    right == null
  ) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => Object.is(leftRecord[key], rightRecord[key]))
  );
}

export function useAppStateSelector<T>(
  selector: (state: AppStateValue) => T,
): T {
  const store = useContext(AppStateStoreContext);
  if (!store) {
    throw new Error("useAppStateSelector must be used within an AppStateProvider");
  }
  const selectorRef = useRef(selector);
  const selectedRef = useRef<T | undefined>(undefined);
  selectorRef.current = selector;
  return useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => {
      const next = selectorRef.current(store.value);
      if (
        selectedRef.current !== undefined &&
        shallowEqual(selectedRef.current, next)
      ) {
        return selectedRef.current;
      }
      selectedRef.current = next;
      return next;
    },
  );
}

export function useAuthState() {
  return useAppStateSelector((state) => ({
    isAuthenticated: state.isAuthenticated,
    demoMode: state.demoMode,
    needsOnboarding: state.needsOnboarding,
    captainName: state.captainName,
    userProfile: state.userProfile,
    completeBetaSignIn: state.completeBetaSignIn,
    signIn: state.signIn,
    signUp: state.signUp,
    continueAsDemo: state.continueAsDemo,
    completeOnboarding: state.completeOnboarding,
    signOut: state.signOut,
  }));
}

export function useUiState() {
  return useAppStateSelector((state) => ({
    activePage: state.activePage,
    setActivePage: state.setActivePage,
    needsLegalAck: state.needsLegalAck,
    acknowledgeLegal: state.acknowledgeLegal,
    needsOnboardingModal: state.needsOnboardingModal,
    onboardingModalOpen: state.onboardingModalOpen,
    openOnboardingModal: state.openOnboardingModal,
    dismissOnboardingModal: state.dismissOnboardingModal,
    budgetToast: state.budgetToast,
    clearBudgetToast: state.clearBudgetToast,
    cadenceToast: state.cadenceToast,
    clearCadenceToast: state.clearCadenceToast,
    previewStrategyCheckToast: state.previewStrategyCheckToast,
  }));
}

export function useMarketState() {
  return useAppStateSelector((state) => ({
    getPortfolioAlignment: state.getPortfolioAlignment,
    getStockAlignment: state.getStockAlignment,
    lastDataPullAtByStrategyId: state.lastDataPullAtByStrategyId,
    getWatchPullStamp: state.getWatchPullStamp,
    getWatchCheckSchedule: state.getWatchCheckSchedule,
    isConvictionScoreReady: state.isConvictionScoreReady,
    getConvictionPresentation: state.getConvictionPresentation,
    marketLoading: state.marketLoading,
    marketError: state.marketError,
    refreshLiveMarket: state.refreshLiveMarket,
    requestImmediateStrategyCheck: state.requestImmediateStrategyCheck,
  }));
}

export function useWorkspaceState() {
  return useAppStateSelector((state) => {
    const {
      isAuthenticated: _isAuthenticated,
      demoMode: _demoMode,
      needsOnboarding: _needsOnboarding,
      captainName: _captainName,
      userProfile: _userProfile,
      needsLegalAck: _needsLegalAck,
      acknowledgeLegal: _acknowledgeLegal,
      needsOnboardingModal: _needsOnboardingModal,
      onboardingModalOpen: _onboardingModalOpen,
      openOnboardingModal: _openOnboardingModal,
      dismissOnboardingModal: _dismissOnboardingModal,
      completeBetaSignIn: _completeBetaSignIn,
      signIn: _signIn,
      signUp: _signUp,
      continueAsDemo: _continueAsDemo,
      completeOnboarding: _completeOnboarding,
      signOut: _signOut,
      budgetToast: _budgetToast,
      clearBudgetToast: _clearBudgetToast,
      cadenceToast: _cadenceToast,
      clearCadenceToast: _clearCadenceToast,
      previewStrategyCheckToast: _previewStrategyCheckToast,
      activePage: _activePage,
      setActivePage: _setActivePage,
      getPortfolioAlignment: _getPortfolioAlignment,
      getStockAlignment: _getStockAlignment,
      lastDataPullAtByStrategyId: _lastDataPullAtByStrategyId,
      getWatchPullStamp: _getWatchPullStamp,
      getWatchCheckSchedule: _getWatchCheckSchedule,
      isConvictionScoreReady: _isConvictionScoreReady,
      marketLoading: _marketLoading,
      marketError: _marketError,
      refreshLiveMarket: _refreshLiveMarket,
      requestImmediateStrategyCheck: _requestImmediateStrategyCheck,
      ...workspace
    } = state;
    return workspace;
  });
}
