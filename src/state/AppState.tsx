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
  computePortfolioAlignment,
  type PortfolioAlignment,
  type TickerAlignment,
} from "../lib/forge/alignment";
import { strategiesForTicker, isDefaultStrategyId } from "../lib/forge/tickerStrategy";
import {
  debounce,
  loadPersistedChipLibrary,
  loadPersistedStrategies,
  persistChipLibrary,
  persistStrategies,
} from "../lib/forge/persistence";
import { resolveStatus } from "../lib/forge/status";
import {
  scoreStock,
  type MetricContext,
  type StockAlignment,
} from "../lib/forge/scoring";
import type {
  Bucket,
  CaptainProfile,
  LogEntry,
  PageId,
  Portfolio,
  RuleChip,
  Strategy,
  WatchlistItem,
} from "../types";

function clonePortfolios(source: Portfolio[]): Portfolio[] {
  return source.map((portfolio) => ({
    ...portfolio,
    holdings: portfolio.holdings.map((holding) => ({
      ...holding,
      strategyIds: [...holding.strategyIds],
    })),
  }));
}

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

  /** Live portfolio holdings (session overlay on mock seed data). */
  portfolios: Portfolio[];
  setTickerEnabledForStrategy: (
    portfolioId: string,
    ticker: string,
    strategyId: string,
    enabled: boolean,
  ) => void;

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
  // Informational (not scoring) — see the implementation comments below.
  getAppliedStrategiesForTicker: (ticker: string) => Strategy[];
  getStrategyChipBreakdown: (
    strategyId: string,
    ticker: string,
    portfolioId?: string,
  ) => StockAlignment | undefined;

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

const persistStrategiesDebounced = debounce(persistStrategies, 300);
const persistChipLibraryDebounced = debounce(persistChipLibrary, 300);

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
  const [strategies, setStrategies] = useState<Strategy[]>(() =>
    loadPersistedStrategies(),
  );
  const [buckets] = useState<Bucket[]>(() => dataSource.getBuckets());
  const [chipLibrary, setChipLibrary] = useState<RuleChip[]>(() =>
    loadPersistedChipLibrary(),
  );
  const [portfolios, setPortfolios] = useState<Portfolio[]>(() =>
    clonePortfolios(dataSource.getPortfolios()),
  );
  const [logsByTicker, setLogsByTicker] = useState<Record<string, LogEntry[]>>(
    () => dataSource.getLogs(),
  );

  useEffect(() => {
    persistStrategiesDebounced(strategies);
  }, [strategies]);

  useEffect(() => {
    persistChipLibraryDebounced(chipLibrary);
  }, [chipLibrary]);

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
    setStrategies((current) => {
      const next = current.map((strategy) =>
        strategy.id === id ? { ...original } : strategy,
      );
      persistStrategies(next);
      return next;
    });
  }, []);

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

      if (isDefaultStrategyId(strategyId)) return;

      setStrategies((current) =>
        current.map((strategy) => {
          if (strategy.id !== strategyId) return strategy;
          const exclusions = { ...(strategy.tickerExclusions ?? {}) };
          const tickers = new Set(exclusions[portfolioId] ?? []);
          if (enabled) tickers.delete(ticker);
          else tickers.add(ticker);
          if (tickers.size === 0) delete exclusions[portfolioId];
          else exclusions[portfolioId] = Array.from(tickers).sort();
          return { ...strategy, tickerExclusions: exclusions };
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
  }, [portfolios, buckets, strategies]);

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

  // Per-ticker strategy assignment via holdings[].strategyIds (defaults) plus
  // applied portfolios for custom copies — see tickerStrategy.ts.
  const getAppliedStrategiesForTicker = useCallback(
    (ticker: string): Strategy[] =>
      strategiesForTicker(ticker, portfolios, strategies),
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
    const byTicker = alignmentByPortfolio[DEFAULT_PORTFOLIO_ID]?.byTicker ?? {};
    return watchlist.map((item) => {
      const aligned = byTicker[item.ticker];
      return aligned
        ? {
            ...item,
            conviction: aligned.conviction,
            status: aligned.status,
            resolved: aligned.resolved,
          }
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
      chipLibrary,
      saveChipToLibrary,
      removeChipFromLibrary,
      updateChipInLibrary,
      buckets,
      portfolios,
      setTickerEnabledForStrategy,
      getPortfolioAlignment,
      getStockAlignment,
      getAppliedStrategiesForTicker,
      getStrategyChipBreakdown,
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
      chipLibrary,
      saveChipToLibrary,
      removeChipFromLibrary,
      updateChipInLibrary,
      buckets,
      portfolios,
      setTickerEnabledForStrategy,
      getPortfolioAlignment,
      getStockAlignment,
      getAppliedStrategiesForTicker,
      getStrategyChipBreakdown,
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
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
