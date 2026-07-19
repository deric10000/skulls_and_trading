import type { Portfolio, Strategy } from "../../types";
import { DEFAULT_STRATEGIES } from "../../data";
import {
  clampCadenceInterval,
  clampCandleInterval,
} from "../forge/scheduler";
import { isLiveSupportedMetric } from "../forge/liveCoverage";
import { migrateStrategyMetrics } from "../forge/metricMigration";
import type { MetricKey, RuleChip, RuleTag } from "../../types";

const APPLY_ONLY_KEYS = new Set([
  "appliedPortfolioIds",
  "tickerExclusions",
  // Conviction mix is editable on defaults from Description → Conviction Scores
  // (weights + which categories contribute). Seed body still wins for rules/tags.
  "categoryWeights",
  "categoryEnabled",
  // Cadence is a per-user pref (like categoryWeights), not a locked body field —
  // editable + persisted even on default strategies.
  "checkInterval",
  "technicalsInterval",
  "cadenceEnabled",
  "cadenceNotify",
]);

/** Fields allowed when patching an isDefault strategy. */
export function isDefaultStrategyApplyPatch(patch: Partial<Strategy>): boolean {
  return Object.keys(patch).every((key) => APPLY_ONLY_KEYS.has(key));
}

function pruneUnsupportedChips(chips: RuleChip[] | undefined): RuleChip[] {
  return (chips ?? []).filter((chip) =>
    isLiveSupportedMetric(chip.metric as MetricKey),
  );
}

function pruneStrategyBody(strategy: Strategy): Strategy {
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
}

/**
 * Hydrate: default strategy *bodies* always come from DEFAULT_STRATEGIES;
 * only apply prefs / ticker exclusions merge from stored. Customs load as stored.
 */
export function mergeStrategiesForHydrate(
  stored: Strategy[],
  _portfolios: Portfolio[],
): Strategy[] {
  const storedById = new Map(stored.map((s) => [s.id, s]));
  const defaults = DEFAULT_STRATEGIES.map((seed) => {
    const overlay = storedById.get(seed.id);
    return pruneStrategyBody({
      ...seed,
      appliedPortfolioIds: overlay?.appliedPortfolioIds ?? [],
      tickerExclusions: overlay?.tickerExclusions ?? {},
      categoryWeights: overlay?.categoryWeights ?? seed.categoryWeights,
      categoryEnabled: overlay?.categoryEnabled,
      // Cadence prefs are user-owned even on defaults (see APPLY_ONLY_KEYS).
      checkInterval: overlay?.checkInterval ?? seed.checkInterval,
      technicalsInterval:
        overlay?.technicalsInterval ?? seed.technicalsInterval,
      cadenceEnabled: overlay?.cadenceEnabled ?? seed.cadenceEnabled,
      cadenceNotify: overlay?.cadenceNotify ?? seed.cadenceNotify,
    });
  });
  const defaultIds = new Set(defaults.map((s) => s.id));
  const customs = stored
    .filter((s) => !s.isDefault && !defaultIds.has(s.id))
    .map(pruneStrategyBody);
  return [...defaults, ...customs];
}

/** Strip body edits from patches targeting defaults. */
export function sanitizeStrategyPatch(
  current: Strategy,
  patch: Partial<Strategy>,
): Partial<Strategy> {
  if (!current.isDefault) return patch;
  const next: Partial<Strategy> = {};
  if ("appliedPortfolioIds" in patch) {
    next.appliedPortfolioIds = patch.appliedPortfolioIds;
  }
  if ("tickerExclusions" in patch) {
    next.tickerExclusions = patch.tickerExclusions;
  }
  if ("categoryWeights" in patch) {
    next.categoryWeights = patch.categoryWeights;
  }
  if ("categoryEnabled" in patch) {
    next.categoryEnabled = patch.categoryEnabled;
  }
  if ("checkInterval" in patch) {
    next.checkInterval = patch.checkInterval;
  }
  if ("technicalsInterval" in patch) {
    next.technicalsInterval = patch.technicalsInterval;
  }
  if ("cadenceEnabled" in patch) {
    next.cadenceEnabled = patch.cadenceEnabled;
  }
  if ("cadenceNotify" in patch) {
    next.cadenceNotify = patch.cadenceNotify;
  }
  return next;
}
