import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  getLastDataPullAt,
  getLastDataPullAtMap,
  subscribeLiveCache,
} from "../lib/market/liveCache";
import {
  formatPullStamp,
  refreshLiveMarketForPortfolios,
} from "../lib/market/refresh";
import {
  computePortfolioAlignment,
  type PortfolioAlignment,
  type TickerAlignment,
} from "../lib/forge/alignment";
import { withPortfolioApplied } from "../lib/forge/appliedPortfolios";
import { createRefreshScheduler } from "../lib/forge/scheduler";
import { strategiesForHolding, isDefaultStrategyId } from "../lib/forge/tickerStrategy";
import { canAddChips, canAddTicker, getBudgetUsage } from "../lib/forge/budgets";
import { debounce } from "../lib/forge/persistence";
import { resolveStatus } from "../lib/forge/status";
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
  ensureSupabaseReady,
  isSupabaseConfigured,
} from "../lib/auth/supabaseClient";
import type { UserProfile } from "../lib/auth/types";
import { isAdmin } from "../lib/auth/types";
import {
  appendConvictionSnapshots,
  emptyWorkspace,
  loadUserWorkspace,
  saveUserWorkspace,
  type UserWorkspace,
} from "../lib/userStore";
import { sanitizeStrategyPatch } from "../lib/userStore/strategyMerge";
import type {
  Bucket,
  CaptainProfile,
  LogEntry,
  PageId,
  PendingQtyOrder,
  Portfolio,
  RuleChip,
  ShareFillEvent,
  Strategy,
  WatchlistItem,
} from "../types";
import {
  nextAverageCost,
  openPnlPercent,
} from "../lib/finance/averageCost";
import { estimateFillTimestamp } from "../lib/finance/timestamps";

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
  holdings: Portfolio["holdings"];
  /** strategyId → tickerExclusions[portfolioId] at enter-edit time. */
  tickerExclusionsByStrategy: Record<string, string[]>;
};

type LogDraft = Pick<LogEntry, "title" | "note" | "strategy">;

interface AppStateValue {
  isAuthenticated: boolean;
  demoMode: boolean;
  needsOnboarding: boolean;
  captainName: string;
  userProfile: UserProfile | null;
  needsLegalAck: boolean;
  acknowledgeLegal: () => void;
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

  strategies: Strategy[];
  createStrategy: () => string;
  updateStrategy: (id: string, patch: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  duplicateStrategy: (id: string) => string | undefined;
  resetStrategy: (id: string) => void;

  /** Live portfolio holdings (persisted per Beta user). */
  portfolios: Portfolio[];
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
  /** Set share count on a holding (portfolios; watchlists ignore in UI). */
  updateHoldingShares: (
    portfolioId: string,
    ticker: string,
    shares: number,
  ) => void;
  /**
   * Session-only: confirm review-modal qty orders (average-cost + fill ledger).
   * LIVE later: POST fills to the brokerage API, then refresh holdings.
   */
  applyQtyOrders: (
    portfolioId: string,
    orders: PendingQtyOrder[],
  ) => void;
  /** Confirmed fill ledger for this session (mock; later from API). */
  shareFills: ShareFillEvent[];
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
  /** mm/dd/yyyy for Current Watch stamp given applied strategies + optional focus. */
  getWatchPullStamp: (
    appliedStrategyIds: string[],
    focusedStrategyId?: string | null,
  ) => string | null;
  marketLoading: boolean;
  marketError: string | null;
  refreshLiveMarket: () => Promise<void>;

  logsByTicker: Record<string, LogEntry[]>;
  addLog: (ticker: string, draft: LogDraft) => void;
  updateLog: (ticker: string, id: string, draft: LogDraft) => void;
  deleteLog: (ticker: string, id: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function currentTimestamp(): string {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return logTimestamp(time);
}

const persistWorkspaceDebounced = debounce((workspace: UserWorkspace) => {
  void saveUserWorkspace(workspace).catch((err) => {
    console.warn("user_state save failed", err);
  });
}, 500);

function applyWorkspaceToSetters(
  workspace: UserWorkspace,
  setters: {
    setPortfolios: (p: Portfolio[]) => void;
    setStrategies: (s: Strategy[]) => void;
    setChipLibrary: (c: RuleChip[]) => void;
    setWatchlist: (w: WatchlistItem[]) => void;
    setLogsByTicker: (l: Record<string, LogEntry[]>) => void;
    setCaptain: (c: CaptainProfile) => void;
    setShareFills: (f: ShareFillEvent[]) => void;
    setSelectedTicker: (t: string) => void;
    setCaptainName: (n: string) => void;
  },
) {
  setters.setPortfolios(clonePortfolios(workspace.portfolios));
  setters.setStrategies(workspace.strategies);
  setters.setChipLibrary(workspace.chipLibrary);
  setters.setWatchlist(workspace.watchlist);
  setters.setLogsByTicker(workspace.logsByTicker);
  setters.setCaptain(workspace.captain);
  setters.setShareFills(workspace.shareFills);
    setters.setCaptainName(workspace.captain.handle);
  setters.setSelectedTicker(workspace.watchlist[0]?.ticker ?? "");
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [captainName, setCaptainName] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [needsLegalAck, setNeedsLegalAck] = useState(false);
  const [budgetToast, setBudgetToast] = useState<string | null>(null);
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
  const [strategies, setStrategies] = useState<Strategy[]>(() =>
    emptyWorkspace().strategies,
  );
  const [buckets] = useState<Bucket[]>(() => dataSource.getBuckets());
  const [chipLibrary, setChipLibrary] = useState<RuleChip[]>(() =>
    emptyWorkspace().chipLibrary,
  );
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [shareFills, setShareFills] = useState<ShareFillEvent[]>([]);
  const [logsByTicker, setLogsByTicker] = useState<Record<string, LogEntry[]>>(
    {},
  );
  const [marketGeneration, setMarketGeneration] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const persistEnabled = useRef(false);

  useEffect(() => {
    return subscribeLiveCache(() => setMarketGeneration(getLiveCacheGeneration()));
  }, []);

  const hydrateFromSession = useCallback(async () => {
    const profile = await fetchProfile();
    if (!profile) return;
    const pending = takePendingInvite();
    if (pending) {
      await redeemInviteCode(pending).catch(() => false);
    }
    const workspace = await loadUserWorkspace(profile.captainName);
    applyWorkspaceToSetters(workspace, {
      setPortfolios,
      setStrategies,
      setChipLibrary,
      setWatchlist,
      setLogsByTicker,
      setCaptain,
      setShareFills,
      setSelectedTicker,
      setCaptainName,
    });
    setUserProfile(profile);
    setDemoMode(false);
    setNeedsOnboarding(false);
    setNeedsLegalAck(true);
    setIsAuthenticated(true);
    setActivePage("home");
    persistEnabled.current = true;
  }, []);

  const completeBetaSignIn = useCallback(async () => {
    await hydrateFromSession();
  }, [hydrateFromSession]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const configured = await ensureSupabaseReady();
      if (cancelled) return;
      if (!configured) {
        setAuthReady(true);
        return;
      }
      try {
        const { data } = await getSupabase().auth.getSession();
        if (!cancelled && data.session) {
          await hydrateFromSession();
        }
      } catch (err) {
        console.warn("session restore failed", err);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
      const { data: sub } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          persistEnabled.current = false;
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
      await refreshLiveMarketForPortfolios(tickers, applied);
    } catch (error) {
      setMarketError(
        error instanceof Error ? error.message : "Market refresh failed",
      );
    } finally {
      setMarketLoading(false);
    }
  }, [portfolios, strategies]);

  const refreshStrategyTickers = useCallback(
    async (strategyId: string, tickers: string[]) => {
      const applied = strategies.filter((s) => s.id === strategyId);
      setMarketLoading(true);
      try {
        await refreshLiveMarketForPortfolios(tickers, applied);
        // Snapshots after pull — alignment scored from live cache on next render;
        // record last known decorated conviction asynchronously via portfolios.
        const asOf = new Date().toISOString().slice(0, 10);
        const rows = tickers.map((ticker) => {
          const holding = portfolios
            .flatMap((p) => p.holdings)
            .find((h) => h.ticker.toUpperCase() === ticker.toUpperCase());
          return {
            strategyId,
            ticker: ticker.toUpperCase(),
            asOf,
            conviction: holding?.conviction ?? 0,
            status: holding?.status,
          };
        });
        void appendConvictionSnapshots(rows);
      } finally {
        setMarketLoading(false);
      }
    },
    [strategies, portfolios],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshLiveMarket();
  }, [isAuthenticated, refreshLiveMarket]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const scheduler = createRefreshScheduler(
      portfolios,
      strategies,
      (strategyId, tickers) => {
        void refreshStrategyTickers(strategyId, tickers);
      },
    );
    scheduler.start();
    return () => scheduler.stop();
  }, [isAuthenticated, portfolios, strategies, refreshStrategyTickers]);

  useEffect(() => {
    if (!persistEnabled.current || !isAuthenticated || demoMode) return;
    persistWorkspaceDebounced({
      portfolios,
      strategies,
      chipLibrary,
      watchlist,
      logsByTicker,
      captain,
      shareFills,
    });
  }, [
    portfolios,
    strategies,
    chipLibrary,
    watchlist,
    logsByTicker,
    captain,
    shareFills,
    isAuthenticated,
    demoMode,
  ]);

  const idCounter = useRef(0);
  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${Date.now()}-${idCounter.current}`;
  }, []);

  const acknowledgeLegal = useCallback(() => {
    setNeedsLegalAck(false);
  }, []);

  const clearBudgetToast = useCallback(() => setBudgetToast(null), []);

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
      setStrategies,
      setChipLibrary,
      setWatchlist,
      setLogsByTicker,
      setCaptain,
      setShareFills,
      setSelectedTicker,
      setCaptainName,
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
      setStrategies,
      setChipLibrary,
      setWatchlist,
      setLogsByTicker,
      setCaptain,
      setShareFills,
      setSelectedTicker,
      setCaptainName,
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
      return "added";
    },
    [portfolios, strategies, adminBypass],
  );

  const updateHoldingShares = useCallback(
    (portfolioId: string, ticker: string, shares: number) => {
      const nextShares = Number.isFinite(shares) ? Math.max(0, shares) : 0;
      setPortfolios((current) =>
        current.map((item) =>
          item.id !== portfolioId
            ? item
            : {
                ...item,
                holdings: item.holdings.map((holding) =>
                  holding.ticker !== ticker
                    ? holding
                    : { ...holding, shares: nextShares },
                ),
              },
        ),
      );
      setWatchlist((current) =>
        current.map((item) =>
          item.ticker !== ticker ? item : { ...item, shares: nextShares },
        ),
      );
    },
    [],
  );

  const applyQtyOrders = useCallback(
    (portfolioId: string, orders: PendingQtyOrder[]) => {
      if (orders.length === 0) return;
      const fills: ShareFillEvent[] = orders.map((order) => ({
        id: nextId("fill"),
        portfolioId,
        ticker: order.ticker,
        side: order.side,
        deltaShares: order.deltaShares,
        sharesBefore: order.sharesBefore,
        sharesAfter: order.sharesAfter,
        fillPrice: order.fillPrice,
        filledAt: order.filledAt || estimateFillTimestamp(),
        source: "mock",
      }));

      setShareFills((current) => [...fills, ...current]);

      setPortfolios((current) =>
        current.map((item) => {
          if (item.id !== portfolioId) return item;
          let holdings = item.holdings;
          for (const order of orders) {
            holdings = holdings.map((holding) => {
              if (holding.ticker !== order.ticker) return holding;
              const avgPrice = nextAverageCost({
                sharesBefore: order.sharesBefore,
                avgBefore: holding.avgPrice,
                side: order.side,
                deltaShares: order.deltaShares,
                fillPrice: order.fillPrice,
                sharesAfter: order.sharesAfter,
              });
              const quote = dataSource.getQuote(order.ticker);
              const last = quote?.lastPrice ?? 0;
              return {
                ...holding,
                shares: order.sharesAfter,
                avgPrice,
                openPnlPct: openPnlPercent(last, avgPrice),
              };
            });
          }
          return { ...item, holdings };
        }),
      );

      if (true) {  // mirror watchlist for all Beta portfolios
        setWatchlist((current) => {
          let next = current;
          for (const order of orders) {
            next = next.map((row) => {
              if (row.ticker !== order.ticker) return row;
              const holdingAvg =
                /* after setState portfolios aren't readable — recompute */ nextAverageCost(
                  {
                    sharesBefore: order.sharesBefore,
                    avgBefore: row.avgPrice,
                    side: order.side,
                    deltaShares: order.deltaShares,
                    fillPrice: order.fillPrice,
                    sharesAfter: order.sharesAfter,
                  },
                );
              const quote = dataSource.getQuote(order.ticker);
              const last = quote?.lastPrice ?? row.price;
              return {
                ...row,
                shares: order.sharesAfter,
                avgPrice: holdingAvg,
                changePct: openPnlPercent(last, holdingAvg),
                price: last,
              };
            });
          }
          return next;
        });
      }
    },
    [nextId],
  );

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
          holdings: [],
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
      for (const strategy of strategies) {
        tickerExclusionsByStrategy[strategy.id] = [
          ...(strategy.tickerExclusions?.[portfolioId] ?? []),
        ];
      }
      return {
        portfolioId,
        holdings: cloneHoldings(portfolio.holdings),
        tickerExclusionsByStrategy,
      };
    },
    [portfolios, strategies],
  );

  const restoreWatchEditSnapshot = useCallback(
    (snapshot: WatchEditSnapshot) => {
      const { portfolioId, holdings, tickerExclusionsByStrategy } = snapshot;
      const nextHoldings = cloneHoldings(holdings);

      setPortfolios((current) =>
        current.map((item) =>
          item.id !== portfolioId ? item : { ...item, holdings: nextHoldings },
        ),
      );

      setStrategies((current) =>
        current.map((strategy) => {
          if (!(strategy.id in tickerExclusionsByStrategy)) return strategy;
          const nextList = tickerExclusionsByStrategy[strategy.id] ?? [];
          const exclusions = { ...(strategy.tickerExclusions ?? {}) };
          if (nextList.length === 0) delete exclusions[portfolioId];
          else exclusions[portfolioId] = [...nextList];
          return { ...strategy, tickerExclusions: exclusions };
        }),
      );

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
    return id;
  }, [nextId]);

  const updateStrategy = useCallback((id: string, patch: Partial<Strategy>) => {
    setStrategies((current) =>
      current.map((strategy) => {
        if (strategy.id !== id) return strategy;
        const safe = sanitizeStrategyPatch(strategy, patch);
        if (strategy.isDefault && Object.keys(safe).length === 0) {
          return strategy;
        }
        return { ...strategy, ...safe };
      }),
    );
  }, []);

  const deleteStrategy = useCallback((id: string) => {
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
  }, []);

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
      setStrategies((current) =>
        current.map((strategy) => ({
          ...strategy,
          rules: (strategy.rules ?? []).map((chip) =>
            chip.libraryChipId === chipId ? { ...chip, ...patch } : chip,
          ),
        })),
      );
    },
    [],
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
    },
    [],
  );

  // Recomputed only when the strategies or buckets change (data snapshots are
  // static). Each portfolio's per-ticker + aggregate alignment in one pass.
  const alignmentByPortfolio = useMemo(() => {
    const map: Record<string, PortfolioAlignment> = {};
    for (const portfolio of portfolios) {
      map[portfolio.id] = computePortfolioAlignment(portfolio, buckets, strategies);
    }
    return map;
    // marketGeneration: liveCache quotes/fundies/techs changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, buckets, strategies, marketGeneration]);

  const lastDataPullAtByStrategyId = useMemo(
    () => getLastDataPullAtMap(),
    [marketGeneration],
  );

  const getWatchPullStamp = useCallback(
    (
      appliedStrategyIds: string[],
      focusedStrategyId?: string | null,
    ): string | null => {
      if (focusedStrategyId) {
        return formatPullStamp(getLastDataPullAt(focusedStrategyId));
      }
      const stamps = appliedStrategyIds
        .map((id) => getLastDataPullAt(id))
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) => Date.parse(iso))
        .filter((ms) => !Number.isNaN(ms));
      if (stamps.length === 0) return null;
      return formatPullStamp(new Date(Math.max(...stamps)).toISOString());
    },
    [marketGeneration],
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
      const lastPrice = (symbol: string): number =>
        dataSource.getTickerInfo(symbol)?.lastPrice ?? 0;
      const bookValue =
        portfolio?.holdings.reduce(
          (sum, item) => sum + item.shares * lastPrice(item.ticker),
          0,
        ) ?? 0;
      // Match alignment.ts: 0 when unheld / empty book so weight chips evaluate
      // (undefined would read as "no data" and never trip Add/Trim zones).
      const weightPct =
        holding && bookValue > 0
          ? (holding.shares * lastPrice(ticker) * 100) / bookValue
          : 0;
      const ctx: MetricContext = {
        fundamentals: dataSource.getFundamentals(ticker),
        technicals: dataSource.getTechnicals(ticker),
        market: dataSource.getMarketContext(),
        openPnlPct: holding?.openPnlPct,
        weightPct,
      };
      return scoreStock(strategy, ctx);
    },
    [strategies, portfolios],
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
      completeBetaSignIn,
      signIn,
      signUp,
      continueAsDemo,
      completeOnboarding,
      signOut,
      budgetToast,
      clearBudgetToast,
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
      updateHoldingShares,
      applyQtyOrders,
      shareFills,
      removeTickerFromPortfolio,
      createPortfolioSource,
      captureWatchEditSnapshot,
      restoreWatchEditSnapshot,
      getPortfolioAlignment,
      getStockAlignment,
      getAppliedStrategiesForTicker,
      getStrategyChipBreakdown,
      lastDataPullAtByStrategyId,
      getWatchPullStamp,
      marketLoading,
      marketError,
      refreshLiveMarket,
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
      completeBetaSignIn,
      signIn,
      signUp,
      continueAsDemo,
      completeOnboarding,
      signOut,
      budgetToast,
      clearBudgetToast,
      captain,
      updateCaptain,
      activePage,
      decoratedWatchlist,
      addTicker,
      removeTicker,
      selectedTicker,
      selectedItem,
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
      updateHoldingShares,
      applyQtyOrders,
      shareFills,
      removeTickerFromPortfolio,
      createPortfolioSource,
      captureWatchEditSnapshot,
      restoreWatchEditSnapshot,
      getPortfolioAlignment,
      getStockAlignment,
      getAppliedStrategiesForTicker,
      getStrategyChipBreakdown,
      lastDataPullAtByStrategyId,
      getWatchPullStamp,
      marketLoading,
      marketError,
      refreshLiveMarket,
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
    ],
  );

  if (!authReady) {
    return null;
  }

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
