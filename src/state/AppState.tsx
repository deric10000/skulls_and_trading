import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildSystemTags,
  CHIP_LIBRARY_SEED,
  DEFAULT_CAPTAIN,
  DEFAULT_CATEGORY_WEIGHTS,
  DEFAULT_STRATEGIES,
} from "../data";
import { dataSource } from "../lib/datasource";
import { computeSignal } from "../lib/signals";
import {
  computePortfolioAlignment,
  type PortfolioAlignment,
  type TickerAlignment,
} from "../lib/forge/alignment";
import type {
  Bucket,
  CaptainProfile,
  LogEntry,
  PageId,
  RuleChip,
  SignalResult,
  Strategy,
  StrategyAssignments,
  WatchlistItem,
} from "../types";

// The default portfolio (whose holdings seed the editable watchlist + dashboard).
const DEFAULT_PORTFOLIO_ID = dataSource.getPortfolios()[0]?.id ?? "";

type LogDraft = Pick<LogEntry, "title" | "note" | "strategy">;

interface AppStateValue {
  // Mock auth (no real backend/provider). Designed to later swap for a real
  // auth/session layer without changing consumers.
  isAuthenticated: boolean;
  demoMode: boolean;
  needsOnboarding: boolean;
  captainName: string;
  signIn: (name?: string) => void;
  signUp: (name: string) => void;
  continueAsDemo: () => void;
  completeOnboarding: () => void;
  signOut: () => void;

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

  assignments: StrategyAssignments;
  assignStrategy: (ticker: string, strategyId: string) => void;
  unassignStrategy: (ticker: string, strategyId: string) => void;
  strategyIdsFor: (ticker: string) => string[];

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

  logsByTicker: Record<string, LogEntry[]>;
  addLog: (ticker: string, draft: LogDraft) => void;
  updateLog: (ticker: string, id: string, draft: LogDraft) => void;
  deleteLog: (ticker: string, id: string) => void;

  getSignal: (ticker: string) => SignalResult;
  selectedSignal: SignalResult;
}

const AppStateContext = createContext<AppStateValue | null>(null);

function currentTimestamp(): string {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Today · ${time}`;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [captainName, setCaptainName] = useState("");
  const [captain, setCaptain] = useState<CaptainProfile>(DEFAULT_CAPTAIN);
  const [activePage, setActivePage] = useState<PageId>("home");

  const updateCaptain = useCallback((patch: Partial<CaptainProfile>) => {
    setCaptain((current) => ({ ...current, ...patch }));
  }, []);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() =>
    dataSource.getInitialWatchlist(),
  );
  const [selectedTicker, setSelectedTicker] = useState<string>(
    () => dataSource.getInitialWatchlist()[0]?.ticker ?? "",
  );
  const [strategies, setStrategies] = useState<Strategy[]>(DEFAULT_STRATEGIES);
  const [assignments, setAssignments] = useState<StrategyAssignments>(() =>
    dataSource.getDefaultAssignments(),
  );
  const [buckets] = useState<Bucket[]>(() => dataSource.getBuckets());
  const [chipLibrary, setChipLibrary] = useState<RuleChip[]>(CHIP_LIBRARY_SEED);
  const [logsByTicker, setLogsByTicker] = useState<Record<string, LogEntry[]>>(
    () => dataSource.getLogs(),
  );

  const idCounter = useRef(0);
  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${Date.now()}-${idCounter.current}`;
  }, []);

  const signIn = useCallback((name?: string) => {
    setCaptainName(name?.trim() || "Captain");
    setDemoMode(false);
    setNeedsOnboarding(false);
    setIsAuthenticated(true);
    setActivePage("home");
  }, []);

  const signUp = useCallback((name: string) => {
    setCaptainName(name.trim() || "Captain");
    setDemoMode(false);
    setNeedsOnboarding(true);
    setIsAuthenticated(true);
  }, []);

  const continueAsDemo = useCallback(() => {
    setCaptainName("Demo Captain");
    setDemoMode(true);
    setNeedsOnboarding(false);
    setIsAuthenticated(true);
    setActivePage("home");
  }, []);

  const completeOnboarding = useCallback(() => {
    setNeedsOnboarding(false);
    setActivePage("dashboard");
  }, []);

  const signOut = useCallback(() => {
    setIsAuthenticated(false);
    setDemoMode(false);
    setNeedsOnboarding(false);
    setCaptainName("");
    setActivePage("home");
  }, []);

  const addTicker = useCallback((rawTicker: string) => {
    const ticker = rawTicker.trim().toUpperCase();
    if (!ticker) return;
    setWatchlist((current) => {
      if (current.some((item) => item.ticker === ticker)) return current;
      const newItem: WatchlistItem = {
        ticker,
        name: "New position · Pending research",
        price: 0,
        changePct: 0,
        status: "Thesis Check",
        conviction: 40,
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
      current.map((strategy) =>
        strategy.id === id ? { ...strategy, ...patch } : strategy,
      ),
    );
  }, []);

  const deleteStrategy = useCallback((id: string) => {
    setStrategies((current) => current.filter((strategy) => strategy.id !== id));
    setAssignments((current) => {
      const next: StrategyAssignments = {};
      for (const [ticker, ids] of Object.entries(current)) {
        next[ticker] = ids.filter((assignedId) => assignedId !== id);
      }
      return next;
    });
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
        categoryWeights: source.categoryWeights
          ? { ...source.categoryWeights }
          : { ...DEFAULT_CATEGORY_WEIGHTS },
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
      current.map((strategy) =>
        strategy.id === id ? { ...original } : strategy,
      ),
    );
  }, []);

  const assignStrategy = useCallback((ticker: string, strategyId: string) => {
    setAssignments((current) => {
      const existing = current[ticker] ?? [];
      if (existing.includes(strategyId)) return current;
      return { ...current, [ticker]: [...existing, strategyId] };
    });
  }, []);

  const unassignStrategy = useCallback((ticker: string, strategyId: string) => {
    setAssignments((current) => {
      const existing = current[ticker] ?? [];
      return {
        ...current,
        [ticker]: existing.filter((id) => id !== strategyId),
      };
    });
  }, []);

  const strategyIdsFor = useCallback(
    (ticker: string) => assignments[ticker] ?? [],
    [assignments],
  );

  const saveChipToLibrary = useCallback(
    (chip: RuleChip) => {
      const libraryChip: RuleChip = {
        ...chip,
        id: nextId("lib"),
      };
      setChipLibrary((current) => [...current, libraryChip]);
    },
    [nextId],
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

  const portfolios = useMemo(() => dataSource.getPortfolios(), []);

  // Recomputed only when the strategies or buckets change (data snapshots are
  // static). Each portfolio's per-ticker + aggregate alignment in one pass.
  const alignmentByPortfolio = useMemo(() => {
    const map: Record<string, PortfolioAlignment> = {};
    for (const portfolio of portfolios) {
      map[portfolio.id] = computePortfolioAlignment(portfolio, buckets, strategies);
    }
    return map;
  }, [portfolios, buckets, strategies]);

  const getPortfolioAlignment = useCallback(
    (portfolioId: string): PortfolioAlignment =>
      alignmentByPortfolio[portfolioId] ?? {
        byTicker: {},
        byBucket: {},
        portfolio: { conviction: 0, status: "Watch" },
      },
    [alignmentByPortfolio],
  );

  const getStockAlignment = useCallback(
    (portfolioId: string, ticker: string): TickerAlignment | undefined =>
      alignmentByPortfolio[portfolioId]?.byTicker[ticker],
    [alignmentByPortfolio],
  );

  // Overlay computed conviction/status onto the default portfolio's watchlist so
  // the Home/dashboard surfaces reflect the Forge engine (not the seed numbers).
  const decoratedWatchlist = useMemo<WatchlistItem[]>(() => {
    const byTicker = alignmentByPortfolio[DEFAULT_PORTFOLIO_ID]?.byTicker ?? {};
    return watchlist.map((item) => {
      const aligned = byTicker[item.ticker];
      return aligned
        ? { ...item, conviction: aligned.conviction, status: aligned.status }
        : item;
    });
  }, [watchlist, alignmentByPortfolio]);

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

  const getSignal = useCallback(
    (ticker: string) => computeSignal(assignments[ticker] ?? [], strategies),
    [assignments, strategies],
  );

  const selectedItem = useMemo(
    () => decoratedWatchlist.find((item) => item.ticker === selectedTicker),
    [decoratedWatchlist, selectedTicker],
  );

  const selectedSignal = useMemo(
    () => getSignal(selectedTicker),
    [getSignal, selectedTicker],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      isAuthenticated,
      demoMode,
      needsOnboarding,
      captainName,
      signIn,
      signUp,
      continueAsDemo,
      completeOnboarding,
      signOut,
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
      assignments,
      assignStrategy,
      unassignStrategy,
      strategyIdsFor,
      chipLibrary,
      saveChipToLibrary,
      removeChipFromLibrary,
      updateChipInLibrary,
      buckets,
      getPortfolioAlignment,
      getStockAlignment,
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
      getSignal,
      selectedSignal,
    }),
    [
      isAuthenticated,
      demoMode,
      needsOnboarding,
      captainName,
      signIn,
      signUp,
      continueAsDemo,
      completeOnboarding,
      signOut,
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
      assignments,
      assignStrategy,
      unassignStrategy,
      strategyIdsFor,
      chipLibrary,
      saveChipToLibrary,
      removeChipFromLibrary,
      updateChipInLibrary,
      buckets,
      getPortfolioAlignment,
      getStockAlignment,
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
      getSignal,
      selectedSignal,
    ],
  );

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
