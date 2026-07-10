import { DEFAULT_CATEGORY_WEIGHTS } from "../../data";
import type { CategoryWeights, RuleCategory, RuleChip, Strategy } from "../../types";
import { CATEGORY_ORDER } from "./metrics";

/**
 * Merge multiple applied strategies into one virtual strategy for scoring a ticker
 * that lists more than one strategyId. Chip weights are scaled by each strategy's
 * category weight, then renormalized within the category; category weights are
 * summed and renormalized to 100%. This is NOT a 50/50 conviction average.
 */
export function mergeStrategiesForScoring(strategies: Strategy[]): Strategy {
  if (strategies.length === 0) {
    throw new Error("mergeStrategiesForScoring requires at least one strategy");
  }
  if (strategies.length === 1) return strategies[0];

  const ordered = [...strategies].sort((a, b) => a.id.localeCompare(b.id));
  const rulesByCategory = new Map<RuleCategory, RuleChip[]>();
  const categoryWeightRaw: Partial<Record<RuleCategory, number>> = {};

  for (const strategy of ordered) {
    const weights = strategy.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS;
    for (const category of CATEGORY_ORDER) {
      categoryWeightRaw[category] =
        (categoryWeightRaw[category] ?? 0) + (weights[category] ?? 0);
    }
    for (const chip of (strategy.rules ?? []).filter((item) => item.enabled)) {
      const categoryWeight = weights[chip.category] ?? 0;
      const scaled: RuleChip = {
        ...chip,
        id: `${strategy.id}:${chip.id}`,
        weightPct: Math.max(0, chip.weightPct) * Math.max(0, categoryWeight),
      };
      const list = rulesByCategory.get(chip.category) ?? [];
      list.push(scaled);
      rulesByCategory.set(chip.category, list);
    }
  }

  const mergedRules: RuleChip[] = [];
  for (const category of CATEGORY_ORDER) {
    const chips = rulesByCategory.get(category) ?? [];
    const total = chips.reduce((sum, chip) => sum + chip.weightPct, 0);
    for (const chip of chips) {
      mergedRules.push({
        ...chip,
        weightPct: total > 0 ? (chip.weightPct / total) * 100 : 0,
      });
    }
  }

  const categoryWeightTotal = CATEGORY_ORDER.reduce(
    (sum, category) => sum + (categoryWeightRaw[category] ?? 0),
    0,
  );
  const categoryWeights = {} as CategoryWeights;
  for (const category of CATEGORY_ORDER) {
    categoryWeights[category] =
      categoryWeightTotal > 0
        ? Math.round(((categoryWeightRaw[category] ?? 0) / categoryWeightTotal) * 100)
        : 0;
  }
  const categorySum = CATEGORY_ORDER.reduce(
    (sum, category) => sum + categoryWeights[category],
    0,
  );
  if (categorySum !== 100 && categoryWeightTotal > 0) {
    const largest = CATEGORY_ORDER.reduce((best, category) =>
      categoryWeights[category] > categoryWeights[best] ? category : best,
    );
    categoryWeights[largest] += 100 - categorySum;
  }

  return {
    id: ordered.map((strategy) => strategy.id).join("+"),
    name: ordered.map((strategy) => strategy.name).join(" + "),
    description: "",
    isDefault: false,
    enabled: true,
    timeframe: [],
    tags: [],
    decisionSignals: [],
    exitLogic: [],
    rules: mergedRules,
    ruleTags: [],
    categoryWeights,
    // Concatenate Layer 3 overlays so multi-strategy tickers still fire zones.
    trimZoneRules: ordered.flatMap((strategy) =>
      (strategy.trimZoneRules ?? []).map((chip) => ({
        ...chip,
        id: `${strategy.id}:${chip.id}`,
      })),
    ),
    trimZoneTags: ordered.flatMap((strategy) =>
      (strategy.trimZoneTags ?? []).map((tag) => ({
        ...tag,
        id: `${strategy.id}:${tag.id}`,
        chipIds: tag.chipIds.map((chipId) => `${strategy.id}:${chipId}`),
      })),
    ),
    addZoneRules: ordered.flatMap((strategy) =>
      (strategy.addZoneRules ?? []).map((chip) => ({
        ...chip,
        id: `${strategy.id}:${chip.id}`,
      })),
    ),
    addZoneTags: ordered.flatMap((strategy) =>
      (strategy.addZoneTags ?? []).map((tag) => ({
        ...tag,
        id: `${strategy.id}:${tag.id}`,
        chipIds: tag.chipIds.map((chipId) => `${strategy.id}:${chipId}`),
      })),
    ),
    goToCashRules: ordered.flatMap((strategy) =>
      (strategy.goToCashRules ?? []).map((chip) => ({
        ...chip,
        id: `${strategy.id}:${chip.id}`,
      })),
    ),
    goToCashTags: ordered.flatMap((strategy) =>
      (strategy.goToCashTags ?? []).map((tag) => ({
        ...tag,
        id: `${strategy.id}:${tag.id}`,
        chipIds: tag.chipIds.map((chipId) => `${strategy.id}:${chipId}`),
      })),
    ),
  };
}
