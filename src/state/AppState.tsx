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
  DEFAULT_ASSIGNMENTS,
  DEFAULT_STRATEGIES,
  INITIAL_WATCHLIST,
  LOG_ENTRIES,
} from "../data";
import { computeSignal } from "../lib/signals";
import type {
  LogEntry,
  PageId,
  SignalResult,
  Strategy,
  StrategyAssignments,
  WatchlistItem,
} from "../types";

type LogDraft = Pick<LogEntry, "title" | "note" | "strategy">;

interface AppStateValue {
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
  const [activePage, setActivePage] = useState<PageId>("home");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);
  const [selectedTicker, setSelectedTicker] = useState<string>(
    INITIAL_WATCHLIST[0]?.ticker ?? "",
  );
  const [strategies, setStrategies] = useState<Strategy[]>(DEFAULT_STRATEGIES);
  const [assignments, setAssignments] =
    useState<StrategyAssignments>(DEFAULT_ASSIGNMENTS);
  const [logsByTicker, setLogsByTicker] =
    useState<Record<string, LogEntry[]>>(LOG_ENTRIES);

  const idCounter = useRef(0);
  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${Date.now()}-${idCounter.current}`;
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
        status: "Thesis Needed",
        conviction: 40,
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
      const copy: Strategy = {
        ...source,
        id: newId,
        name: `${source.name} (Copy)`,
        isDefault: false,
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
    () => watchlist.find((item) => item.ticker === selectedTicker),
    [watchlist, selectedTicker],
  );

  const selectedSignal = useMemo(
    () => getSignal(selectedTicker),
    [getSignal, selectedTicker],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      activePage,
      setActivePage,
      watchlist,
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
      logsByTicker,
      addLog,
      updateLog,
      deleteLog,
      getSignal,
      selectedSignal,
    }),
    [
      activePage,
      watchlist,
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
