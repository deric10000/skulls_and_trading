import type { RuleCategory, StatusType } from "../../types";

/** Seeded / placeholder plans start with this prefix and render muted. */
export const EXAMPLE_PLAN_PREFIX = "Example:";

export function isExamplePlan(plan: string | undefined): boolean {
  if (!plan) return false;
  return /^\s*Example:\s*/i.test(plan);
}

/** Strip the Example: prefix after the captain edits a seeded plan. */
export function normalizePlanEdit(
  previous: string | undefined,
  next: string,
): string {
  if (isExamplePlan(previous) && next !== previous) {
    return next.replace(/^\s*Example:\s*/i, "");
  }
  return next;
}

export function examplePlan(body: string): string {
  return `${EXAMPLE_PLAN_PREFIX} ${body}`;
}

/**
 * Categories whose Layer-2 diagnostics can emit a given status. A status may
 * map to more than one category (e.g. Rule Break from thesis or trade).
 * Layer 3 zones are not category-driven — Watch Summary reads zoneResults.
 */
const STATUS_CATEGORIES: Partial<Record<StatusType, RuleCategory[]>> = {
  "Risk Drift": ["risk"],
  "Risk Check": ["risk"],
  "Review Risk": ["risk"],
  "Rule Break": ["thesis", "trade"],
  "Rule Conflict": ["thesis"],
  "Thesis Check": ["thesis"],
  "Watch Setup": ["setup"],
  "Exit Review": ["trade"],
  "Trim Review": ["trade"],
  "Hold Plan": ["trade"],
  "Concentration Review": ["position"],
  "Patience Review": ["timeframe"],
};

const LAYER3_STATUSES: StatusType[] = ["Trim Zone", "Add Zone", "Go to Cash"];

export function isLayer3Status(status: StatusType): boolean {
  return LAYER3_STATUSES.includes(status);
}

/** Categories that drive a single status label. */
export function categoriesForStatus(status: StatusType): RuleCategory[] {
  return STATUS_CATEGORIES[status] ?? [];
}

/** Categories whose failing chips should appear as plan triggers. */
export function triggerCategoriesForStatuses(
  statuses: StatusType[],
): Set<RuleCategory> {
  const categories = new Set<RuleCategory>();
  for (const status of statuses) {
    for (const category of categoriesForStatus(status)) {
      categories.add(category);
    }
  }
  return categories;
}
