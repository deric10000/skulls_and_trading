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

/** Redistribute weights across `targets` so they sum to 100 (proportional). */
export function renormalizeCategoryWeights(
  weights: CategoryWeights,
  targets: RuleCategory[],
): CategoryWeights {
  const next: CategoryWeights = { ...weights };
  for (const category of CATEGORY_ORDER) {
    if (!targets.includes(category)) next[category] = 0;
  }
  if (targets.length === 0) return next;

  const sum = targets.reduce((total, category) => total + (next[category] ?? 0), 0);
  if (sum <= 0) {
    const each = Math.floor(100 / targets.length);
    let remainder = 100 - each * targets.length;
    for (const category of targets) {
      next[category] = each + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
    return next;
  }

  let allocated = 0;
  targets.forEach((category, index) => {
    if (index === targets.length - 1) {
      next[category] = 100 - allocated;
      return;
    }
    const share = Math.round(((next[category] ?? 0) / sum) * 100);
    next[category] = share;
    allocated += share;
  });
  return next;
}

/**
 * Toggle a category's contribution to conviction. Disabling zeros its weight
 * and renormalizes the remaining enabled categories to 100%. Enabling leaves
 * weights unchanged (the category stays at 0%) so the captain can reallocate.
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
    return {
      categoryEnabled,
      categoryWeights: renormalizeCategoryWeights(weights, remaining),
    };
  }

  categoryEnabled[category] = true;
  return { categoryEnabled, categoryWeights: weights };
}
