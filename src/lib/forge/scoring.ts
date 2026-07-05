import type {
  CategoryWeights,
  FundamentalSnapshot,
  MarketContext,
  MetricKey,
  MetricValue,
  RuleCategory,
  RuleChip,
  RuleOperator,
  RuleTag,
  StatusType,
  Strategy,
  TechnicalSnapshot,
} from "../../types";
import { DEFAULT_CATEGORY_WEIGHTS } from "../../data";
import { CATEGORY_ORDER, METRICS } from "./metrics";

// ---------------------------------------------------------------------------
// Strategy Forge scoring engine — pure functions, no I/O.
//
// Implements the normalized tag/chip/weight algorithm (docs/strategy-forge.md):
//   1. Resolve active chips per category (union of applied tags' chips +
//      individually applied chips, DEDUPED; default = "All Active Chips").
//   2. Evaluate each active chip pass/fail. A null metric is "no data" and is
//      EXCLUDED from the calculation — never counted as a fail.
//   3. Normalize active rule weights so they fill 100% of the category.
//   4. categoryScore = Σ(passed × normalizedWeight)  → 0–100
//   5. categoryPoints = categoryScore × categoryWeight / 100
//   6. conviction = Σ categoryPoints, renormalized over categories that have
//      scorable chips (completeness warnings surface the gaps instead).
// There are NO thesis/risk gates or conviction clamps — thesis and risk
// dominate through their category weights.
// ---------------------------------------------------------------------------

// Everything a chip might need to read, for one ticker in one portfolio context.
export interface MetricContext {
  fundamentals?: FundamentalSnapshot;
  technicals?: TechnicalSnapshot;
  market: MarketContext;
  weightPct?: number; // this name's share of the portfolio book
  openPnlPct?: number; // unrealized P&L vs avg cost
  holdingDays?: number; // calendar days since the position was entered
  timeframe?: string; // intended holding horizon (qualitative)
}

export type ChipOutcome = "pass" | "fail" | "no-data";

export interface ChipResult {
  chip: RuleChip;
  outcome: ChipOutcome;
  value: MetricValue;
}

export interface CategoryScore {
  category: RuleCategory;
  score: number | null; // null = no scorable chips (excluded from the blend)
  passCount: number;
  scorableCount: number;
}

export interface StockAlignment {
  hasRules: boolean; // false → caller should fall back to seed data
  conviction: number; // 0–100
  status: StatusType;
  categories: CategoryScore[];
  results: ChipResult[];
}

// ---- Metric reads -------------------------------------------------------

export function readMetric(metric: MetricKey, ctx: MetricContext): MetricValue {
  const source = METRICS[metric]?.source;
  switch (source) {
    case "fundamental":
      return ctx.fundamentals
        ? ((ctx.fundamentals[metric as keyof FundamentalSnapshot] as MetricValue) ?? null)
        : null;
    case "technical":
      return ctx.technicals
        ? ((ctx.technicals[metric as keyof TechnicalSnapshot] as MetricValue) ?? null)
        : null;
    case "market":
      return (ctx.market[metric as keyof MarketContext] as MetricValue) ?? null;
    case "position":
      if (metric === "weightPct") return ctx.weightPct ?? null;
      if (metric === "openPnlPct") return ctx.openPnlPct ?? null;
      if (metric === "holdingDays") return ctx.holdingDays ?? null;
      if (metric === "timeframe") return null; // qualitative handled separately
      return null;
    default:
      return null;
  }
}

function compareNumeric(
  value: number,
  operator: RuleOperator,
  target: number | [number, number] | string,
): boolean {
  switch (operator) {
    case ">":
      return typeof target === "number" && value > target;
    case ">=":
      return typeof target === "number" && value >= target;
    case "<":
      return typeof target === "number" && value < target;
    case "<=":
      return typeof target === "number" && value <= target;
    case "between":
      return Array.isArray(target) && value >= target[0] && value <= target[1];
    default:
      return false;
  }
}

// ---- Chip evaluation ----------------------------------------------------

export function evaluateChip(chip: RuleChip, ctx: MetricContext): ChipResult {
  // Qualitative timeframe match (string "is").
  if (chip.metric === "timeframe") {
    if (ctx.timeframe == null) return { chip, outcome: "no-data", value: null };
    const pass = String(ctx.timeframe) === String(chip.value);
    return { chip, outcome: pass ? "pass" : "fail", value: null };
  }

  const value = readMetric(chip.metric, ctx);
  if (value == null) return { chip, outcome: "no-data", value: null };

  // Boolean flags are stored as 1/0 and tested with `is TRUE` / `is FALSE`.
  if (chip.operator === "is" && METRICS[chip.metric]?.format === "boolean") {
    const expected = String(chip.value).toUpperCase() === "TRUE" ? 1 : 0;
    return { chip, outcome: value === expected ? "pass" : "fail", value };
  }

  const pass = compareNumeric(value, chip.operator, chip.value);
  return { chip, outcome: pass ? "pass" : "fail", value };
}

// ---- Active chip resolution ----------------------------------------------

// The chips that score a stock for one category: the union of the applied
// tags' member chips plus individually applied chips, DEDUPED (a chip shared
// by two applied tags counts once). With no applied tags/chips, the default
// lens is "All Active Chips" — every enabled chip in the category. A system
// tag ("All Active Chips") in the applied set also expands to the full set.
export function resolveActiveChips(
  strategy: Strategy,
  category: RuleCategory,
  appliedTagIds?: string[],
  appliedChipIds?: string[],
): RuleChip[] {
  const categoryChips = (strategy.rules ?? []).filter(
    (chip) => chip.category === category && chip.enabled,
  );
  const hasApplied =
    (appliedTagIds && appliedTagIds.length > 0) ||
    (appliedChipIds && appliedChipIds.length > 0);
  if (!hasApplied) return categoryChips;

  const tags: RuleTag[] = (strategy.ruleTags ?? []).filter(
    (tag) => tag.category === category,
  );
  const activeIds = new Set<string>(appliedChipIds ?? []);
  for (const tagId of appliedTagIds ?? []) {
    const tag = tags.find((item) => item.id === tagId);
    if (!tag) continue;
    if (tag.system) return categoryChips; // All Active Chips → full set
    for (const chipId of tag.chipIds) activeIds.add(chipId);
  }
  return categoryChips.filter((chip) => activeIds.has(chip.id));
}

// ---- Category scoring ---------------------------------------------------

// Normalized pass/fail scoring: active rule weights are rescaled so they fill
// 100% of the category for this stock; no-data chips leave the calculation.
export function scoreCategory(
  category: RuleCategory,
  results: ChipResult[],
): CategoryScore {
  const inCategory = results.filter(
    (result) => result.chip.category === category && result.chip.enabled,
  );
  const scorable = inCategory.filter((result) => result.outcome !== "no-data");
  if (scorable.length === 0) {
    return { category, score: null, passCount: 0, scorableCount: 0 };
  }
  const totalWeight = scorable.reduce(
    (sum, result) => sum + Math.max(0, result.chip.weightPct),
    0,
  );
  if (totalWeight <= 0) {
    return { category, score: null, passCount: 0, scorableCount: scorable.length };
  }
  const passWeight = scorable
    .filter((result) => result.outcome === "pass")
    .reduce((sum, result) => sum + Math.max(0, result.chip.weightPct), 0);
  const passCount = scorable.filter((result) => result.outcome === "pass").length;
  return {
    category,
    score: Math.round((passWeight / totalWeight) * 100),
    passCount,
    scorableCount: scorable.length,
  };
}

// ---- Status mapping -----------------------------------------------------

export function statusFromConviction(conviction: number): StatusType {
  if (conviction >= 80) return "High Alignment";
  if (conviction >= 60) return "Aligned";
  if (conviction >= 40) return "Watch";
  return "Review";
}

// ---- Top-level: score one stock against one strategy --------------------

export function scoreStock(
  strategy: Strategy,
  ctx: MetricContext,
): StockAlignment {
  const rules = (strategy.rules ?? []).filter((chip) => chip.enabled);
  if (rules.length === 0) {
    return {
      hasRules: false,
      conviction: 0,
      status: "Watch",
      categories: [],
      results: [],
    };
  }

  // Default lens per category = All Active Chips (per-stock tag application is
  // a later authoring pass; the engine supports it via resolveActiveChips).
  const results = CATEGORY_ORDER.flatMap((category) =>
    resolveActiveChips(strategy, category).map((chip) => evaluateChip(chip, ctx)),
  );
  const categories = CATEGORY_ORDER.map((category) =>
    scoreCategory(category, results),
  );

  const weights: CategoryWeights =
    strategy.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS;

  // Sum categoryScore × categoryWeight across categories with scorable chips,
  // renormalized over the participating weights so an unconfigured category
  // doesn't silently zero the score (completeness warnings surface that).
  let weightedSum = 0;
  let weightTotal = 0;
  for (const categoryScore of categories) {
    if (categoryScore.score == null) continue;
    const weight = weights[categoryScore.category] ?? 0;
    weightedSum += weight * categoryScore.score;
    weightTotal += weight;
  }
  const conviction = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

  return {
    hasRules: true,
    conviction,
    status: statusFromConviction(conviction),
    categories,
    results,
  };
}

// ---- Strategy completeness ------------------------------------------------

// A strategy must be complete before it can be applied to a portfolio. The
// Configure card renders these as cautions; "Apply to Portfolio" stays
// disabled until the list is empty. See docs/strategy-forge.md §6.
export interface StrategyValidation {
  complete: boolean;
  issues: string[];
}

export function validateStrategy(strategy: Strategy): StrategyValidation {
  const issues: string[] = [];
  const rules = strategy.rules ?? [];
  const tags = strategy.ruleTags ?? [];

  if (!strategy.name.trim()) issues.push("Name the strategy.");
  if (!strategy.thesisDescription?.trim()) {
    issues.push("Describe the thesis in Thesis & Fundamentals.");
  }

  const weights: CategoryWeights =
    strategy.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS;
  const weightTotal = CATEGORY_ORDER.reduce(
    (sum, category) => sum + (weights[category] ?? 0),
    0,
  );
  if (weightTotal !== 100) {
    issues.push(`Category conviction weights total ${weightTotal}% — they must total 100%.`);
  }

  const labelFor: Record<RuleCategory, string> = {
    thesis: "Thesis & Fundamentals",
    setup: "Technical Analysis",
    risk: "Risk Rules",
    position: "Position Size",
    trade: "Trade Management",
    timeframe: "Hold Timeframe",
  };

  for (const category of CATEGORY_ORDER) {
    const chips = rules.filter(
      (chip) => chip.category === category && chip.enabled,
    );
    if (chips.length === 0) {
      issues.push(`Add at least one rule chip to ${labelFor[category]}.`);
      continue;
    }
    const chipTotal = chips.reduce((sum, chip) => sum + chip.weightPct, 0);
    if (Math.round(chipTotal) !== 100) {
      issues.push(
        `${labelFor[category]} rule weights total ${Math.round(chipTotal)}% — they must total 100%.`,
      );
    }
    const customTags = tags.filter(
      (tag) => tag.category === category && !tag.system,
    );
    if (customTags.length > 0) {
      const tagTotal = customTags.reduce((sum, tag) => sum + tag.weightPct, 0);
      if (Math.round(tagTotal) !== 100) {
        issues.push(
          `${labelFor[category]} tag weights total ${Math.round(tagTotal)}% — they must total 100%.`,
        );
      }
    }
  }

  return { complete: issues.length === 0, issues };
}

// ---- Portfolio aggregate ------------------------------------------------

export interface WeightedAlignment {
  conviction: number;
  marketValue: number; // market-value weight of this slice
}

// Market-value-weighted average conviction across bucket allocations, so a
// 10-share momentum slice doesn't outweigh a 100-share core position.
export function aggregateConviction(slices: WeightedAlignment[]): {
  conviction: number;
  status: StatusType;
} {
  const totalValue = slices.reduce((sum, slice) => sum + slice.marketValue, 0);
  if (totalValue <= 0) return { conviction: 0, status: "Watch" };
  const weighted = slices.reduce(
    (sum, slice) => sum + slice.conviction * slice.marketValue,
    0,
  );
  const conviction = Math.round(weighted / totalValue);
  return { conviction, status: statusFromConviction(conviction) };
}
