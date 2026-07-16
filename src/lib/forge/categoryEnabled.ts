import { DEFAULT_CATEGORY_WEIGHTS } from "../../data";
import type { CategoryWeights, RuleCategory, Strategy } from "../../types";
import { CATEGORY_ORDER } from "./metrics";

/** Missing / undefined means the category contributes to conviction. */
export function isCategoryEnabled(
  strategy: Strategy,
  category: RuleCategory,
): boolean {
  return strategy.categoryEnabled?.[category] !== false;
}

export function enabledCategories(strategy: Strategy): RuleCategory[] {
  return CATEGORY_ORDER.filter((category) =>
    isCategoryEnabled(strategy, category),
  );
}

/**
 * Scale `targets` proportionally so they sum to `total`. Categories outside
 * `targets` are left unchanged (parked weights stay put).
 */
export function scaleCategoryWeightsToTotal(
  weights: CategoryWeights,
  targets: RuleCategory[],
  total: number,
): CategoryWeights {
  const next: CategoryWeights = { ...weights };
  if (targets.length === 0) return next;

  const goal = Math.max(0, Math.min(100, Math.round(total)));
  const sum = targets.reduce((acc, category) => acc + (next[category] ?? 0), 0);

  if (sum <= 0) {
    const each = Math.floor(goal / targets.length);
    let remainder = goal - each * targets.length;
    for (const category of targets) {
      next[category] = each + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
    return next;
  }

  let allocated = 0;
  targets.forEach((category, index) => {
    if (index === targets.length - 1) {
      next[category] = goal - allocated;
      return;
    }
    const share = Math.round(((next[category] ?? 0) / sum) * goal);
    next[category] = share;
    allocated += share;
  });
  return next;
}

/** @deprecated Prefer scaleCategoryWeightsToTotal — kept as a 100% shorthand. */
export function renormalizeCategoryWeights(
  weights: CategoryWeights,
  targets: RuleCategory[],
): CategoryWeights {
  return scaleCategoryWeightsToTotal(weights, targets, 100);
}

/**
 * Toggle a category's contribution to conviction.
 *
 * Off: park its weight exactly (still shown); scale the other enabled
 * categories from their current sum (e.g. 45%) up to 100%.
 *
 * On: restore the parked weight exactly; scale the other enabled categories
 * from 100% down to (100 − parked), e.g. Thesis 55% back → others 45%.
 */
export function patchCategoryEnabled(
  strategy: Strategy,
  category: RuleCategory,
  enabled: boolean,
): Pick<Strategy, "categoryEnabled" | "categoryWeights"> | null {
  const currentlyEnabled = isCategoryEnabled(strategy, category);
  if (currentlyEnabled === enabled) return null;

  const weights: CategoryWeights = {
    ...(strategy.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS),
  };
  const categoryEnabled: Partial<Record<RuleCategory, boolean>> = {
    ...(strategy.categoryEnabled ?? {}),
  };

  if (!enabled) {
    const remaining = enabledCategories(strategy).filter((item) => item !== category);
    if (remaining.length === 0) return null;
    categoryEnabled[category] = false;
    // Park weights[category] as-is; stretch the rest to fill 100%.
    return {
      categoryEnabled,
      categoryWeights: scaleCategoryWeightsToTotal(weights, remaining, 100),
    };
  }

  categoryEnabled[category] = true;
  const parked = Math.max(0, Math.min(100, weights[category] ?? 0));
  weights[category] = parked;
  const others = enabledCategories(strategy); // still excludes `category`
  // Restore parked exactly; shrink the others to the leftover share.
  return {
    categoryEnabled,
    categoryWeights: scaleCategoryWeightsToTotal(weights, others, 100 - parked),
  };
}
