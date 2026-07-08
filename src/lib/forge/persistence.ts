import type { RuleChip, Strategy } from "../../types";
import { CHIP_LIBRARY_SEED, DEFAULT_STRATEGIES } from "../../data";

const STORAGE_VERSION = 1;
const STRATEGIES_KEY = "forge:strategies";
const CHIP_LIBRARY_KEY = "forge:chipLibrary";

interface StoredPayload<T> {
  version: number;
  data: T;
}

function readPayload<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload<T>;
    if (parsed.version !== STORAGE_VERSION || !parsed.data) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writePayload<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredPayload<T> = { version: STORAGE_VERSION, data };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Quota or privacy mode — ignore; in-memory state still works.
  }
}

export function loadPersistedStrategies(): Strategy[] {
  return readPayload<Strategy[]>(STRATEGIES_KEY) ?? DEFAULT_STRATEGIES;
}

export function loadPersistedChipLibrary(): RuleChip[] {
  return readPayload<RuleChip[]>(CHIP_LIBRARY_KEY) ?? CHIP_LIBRARY_SEED;
}

export function persistStrategies(strategies: Strategy[]): void {
  writePayload(STRATEGIES_KEY, strategies);
}

export function persistChipLibrary(chipLibrary: RuleChip[]): void {
  writePayload(CHIP_LIBRARY_KEY, chipLibrary);
}

export function clearPersistedStrategy(id: string): void {
  const stored = readPayload<Strategy[]>(STRATEGIES_KEY);
  if (!stored) return;
  const next = stored.filter((strategy) => strategy.id !== id);
  writePayload(STRATEGIES_KEY, next);
}

export function clearAllForgePersistence(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STRATEGIES_KEY);
  window.localStorage.removeItem(CHIP_LIBRARY_KEY);
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
