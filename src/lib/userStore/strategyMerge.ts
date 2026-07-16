import type { Portfolio, Strategy } from "../../types";
import { DEFAULT_STRATEGIES } from "../../data";
import {
  clampCadenceInterval,
} from "../forge/scheduler";
import { isLiveSupportedMetric } from "../forge/liveCoverage";
import type { MetricKey, RuleChip, RuleTag } from "../../types";

const APPLY_ONLY_KEYS = new Set([
  "appliedPortfolioIds",
  "tickerExclusions",
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
  const rules = pruneUnsupportedChips(strategy.rules);
  const allowedIds = new Set(rules.map((chip) => chip.id));
  const pruneTags = (tags: RuleTag[] | undefined): RuleTag[] | undefined => {
    if (!tags) return tags;
    return tags.map((tag) => ({
      ...tag,
      chipIds: tag.chipIds.filter((id) => allowedIds.has(id) || tag.system),
    }));
  };
  const checkInterval = clampCadenceInterval(strategy.checkInterval);
  return {
    ...strategy,
    checkInterval,
    technicalsInterval: clampCadenceInterval(
      strategy.technicalsInterval ?? checkInterval,
    ),
    rules,
    ruleTags: pruneTags(strategy.ruleTags),
    trimZoneRules: pruneUnsupportedChips(strategy.trimZoneRules),
    addZoneRules: pruneUnsupportedChips(strategy.addZoneRules),
    goToCashRules: pruneUnsupportedChips(strategy.goToCashRules),
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
  return next;
}
