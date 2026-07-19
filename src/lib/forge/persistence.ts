import type { MetricKey, RuleChip, RuleTag, Strategy } from "../../types";
import { CHIP_LIBRARY_SEED, DEFAULT_STRATEGIES, PORTFOLIOS } from "../../data";
import { portfolioIdsReferencingStrategy } from "./appliedPortfolios";
import { isLiveSupportedMetric } from "./liveCoverage";
import { migrateChips, migrateStrategyMetrics } from "./metricMigration";
import { clampCadenceInterval, clampCandleInterval } from "./scheduler";

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

/**
 * Seed Layer 3 overlays onto default strategies that were persisted before
 * trim/add/go-to-cash zone fields existed. Only fills when the field is missing
 * or empty — never overwrites an edited non-empty list.
 */
function backfillLayer3Overlays(strategies: Strategy[]): Strategy[] {
  const defaultById = new Map(
    DEFAULT_STRATEGIES.map((strategy) => [strategy.id, strategy]),
  );

  return strategies.map((strategy) => {
    const defaults = defaultById.get(strategy.id);
    if (!defaults) return strategy;

    const patch: Partial<Strategy> = {};
    const missing = (current: RuleChip[] | RuleTag[] | undefined) =>
      current == null || current.length === 0;

    if (missing(strategy.trimZoneRules) && defaults.trimZoneRules?.length) {
      patch.trimZoneRules = defaults.trimZoneRules.map((chip) => ({ ...chip }));
    }
    if (missing(strategy.trimZoneTags) && defaults.trimZoneTags?.length) {
      patch.trimZoneTags = defaults.trimZoneTags.map((tag) => ({
        ...tag,
        chipIds: [...tag.chipIds],
      }));
    }
    if (missing(strategy.addZoneRules) && defaults.addZoneRules?.length) {
      patch.addZoneRules = defaults.addZoneRules.map((chip) => ({ ...chip }));
    }
    if (missing(strategy.addZoneTags) && defaults.addZoneTags?.length) {
      patch.addZoneTags = defaults.addZoneTags.map((tag) => ({
        ...tag,
        chipIds: [...tag.chipIds],
      }));
    }
    if (missing(strategy.goToCashRules) && defaults.goToCashRules?.length) {
      patch.goToCashRules = defaults.goToCashRules.map((chip) => ({ ...chip }));
    }
    if (missing(strategy.goToCashTags) && defaults.goToCashTags?.length) {
      patch.goToCashTags = defaults.goToCashTags.map((tag) => ({
        ...tag,
        chipIds: [...tag.chipIds],
      }));
    }

    return Object.keys(patch).length > 0 ? { ...strategy, ...patch } : strategy;
  });
}

/**
 * Demo Captain is ephemeral — seed wins on reload. For `isDefault` strategies,
 * ensure appliedPortfolioIds covers every seeded PORTFOLIOS entry whose
 * holdings reference the strategy. Customs untouched. Do not run this against
 * live API portfolios once Pass 2 moves strategies server-side.
 */
function backfillAppliedPortfolios(strategies: Strategy[]): Strategy[] {
  return strategies.map((strategy) => {
    if (!strategy.isDefault) return strategy;
    const required = portfolioIdsReferencingStrategy(PORTFOLIOS, strategy.id);
    const applied = new Set(strategy.appliedPortfolioIds ?? []);
    let changed = false;
    for (const id of required) {
      if (!applied.has(id)) {
        applied.add(id);
        changed = true;
      }
    }
    if (!changed) return strategy;
    return {
      ...strategy,
      appliedPortfolioIds: Array.from(applied).sort((a, b) =>
        a.localeCompare(b),
      ),
    };
  });
}

function pruneUnsupportedChips(chips: RuleChip[] | undefined): RuleChip[] {
  return (chips ?? []).filter((chip) =>
    isLiveSupportedMetric(chip.metric as MetricKey),
  );
}

/** Layer 1 + cadence: migrate legacy keys, drop unsupported, clamp intervals. */
function pruneStrategiesForLive(strategies: Strategy[]): Strategy[] {
  return strategies.map((strategy) => {
    const migrated = migrateStrategyMetrics(strategy);
    const rules = pruneUnsupportedChips(migrated.rules);
    const allowedIds = new Set(rules.map((chip) => chip.id));
    const pruneTags = (tags: RuleTag[] | undefined): RuleTag[] | undefined => {
      if (!tags) return tags;
      return tags.map((tag) => ({
        ...tag,
        chipIds: tag.chipIds.filter((id) => allowedIds.has(id) || tag.system),
      }));
    };
    const checkInterval = clampCadenceInterval(migrated.checkInterval);
    return {
      ...migrated,
      checkInterval,
      technicalsInterval: clampCandleInterval(migrated.technicalsInterval),
      rules,
      ruleTags: pruneTags(migrated.ruleTags),
      trimZoneRules: pruneUnsupportedChips(migrated.trimZoneRules),
      addZoneRules: pruneUnsupportedChips(migrated.addZoneRules),
      goToCashRules: pruneUnsupportedChips(migrated.goToCashRules),
    };
  });
}

export function loadPersistedStrategies(): Strategy[] {
  const stored = readPayload<Strategy[]>(STRATEGIES_KEY);
  if (!stored) return pruneStrategiesForLive(DEFAULT_STRATEGIES);
  return pruneStrategiesForLive(
    backfillAppliedPortfolios(
      backfillLayer3Overlays(backfillMyPlans(stored)),
    ),
  );
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
  const base = stored
    ? backfillChipLibraryPlans(stored)
    : CHIP_LIBRARY_SEED;
  return pruneUnsupportedChips(migrateChips(base));
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
