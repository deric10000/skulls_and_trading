import type { RuleChip, RuleTag, Strategy } from "../../types";
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

/** Fill missing myPlan from the matching default strategy chip/tag (by id). */
function backfillMyPlans(strategies: Strategy[]): Strategy[] {
  const defaultById = new Map(
    DEFAULT_STRATEGIES.map((strategy) => [strategy.id, strategy]),
  );

  return strategies.map((strategy) => {
    const defaults = defaultById.get(strategy.id);
    if (!defaults) return strategy;

    const defaultChipPlan = new Map(
      (defaults.rules ?? [])
        .filter((chip) => chip.myPlan)
        .map((chip) => [chip.id, chip.myPlan as string]),
    );
    const defaultTagPlan = new Map(
      (defaults.ruleTags ?? [])
        .filter((tag) => tag.myPlan)
        .map((tag) => [tag.id, tag.myPlan as string]),
    );

    let changed = false;
    const rules = (strategy.rules ?? []).map((chip) => {
      if (chip.myPlan || !defaultChipPlan.has(chip.id)) return chip;
      changed = true;
      return { ...chip, myPlan: defaultChipPlan.get(chip.id) };
    });
    const ruleTags = (strategy.ruleTags ?? []).map((tag: RuleTag) => {
      if (tag.myPlan || !defaultTagPlan.has(tag.id)) return tag;
      changed = true;
      return { ...tag, myPlan: defaultTagPlan.get(tag.id) };
    });

    return changed ? { ...strategy, rules, ruleTags } : strategy;
  });
}

export function loadPersistedStrategies(): Strategy[] {
  const stored = readPayload<Strategy[]>(STRATEGIES_KEY);
  if (!stored) return DEFAULT_STRATEGIES;
  return backfillMyPlans(stored);
}

/** Fill missing myPlan on library chips from CHIP_LIBRARY_SEED (by id). */
function backfillChipLibraryPlans(chips: RuleChip[]): RuleChip[] {
  const defaults = new Map(
    CHIP_LIBRARY_SEED.filter((chip) => chip.myPlan).map((chip) => [
      chip.id,
      chip.myPlan as string,
    ]),
  );
  let changed = false;
  const next = chips.map((chip) => {
    if (chip.myPlan || !defaults.has(chip.id)) return chip;
    changed = true;
    return { ...chip, myPlan: defaults.get(chip.id) };
  });
  return changed ? next : chips;
}

export function loadPersistedChipLibrary(): RuleChip[] {
  const stored = readPayload<RuleChip[]>(CHIP_LIBRARY_KEY);
  if (!stored) return CHIP_LIBRARY_SEED;
  return backfillChipLibraryPlans(stored);
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
