import type {
  CategoryWeights,
  FundamentalSnapshot,
  MarketContext,
  MetricKey,
  MetricValue,
  RuleCategory,
  RuleChip,
  RuleOperator,
  StatusType,
  Strategy,
  TechnicalSnapshot,
} from "../../types";
import { DEFAULT_CATEGORY_WEIGHTS } from "../../data";
import { METRICS } from "./metrics";

// ---------------------------------------------------------------------------
// Strategy Forge scoring engine — pure functions, no I/O.
//
// Turns a strategy's rule chips + a stock's data into a 0–100 Strategy
// Conviction and an alignment status. See docs/strategy-forge.md for the
// framework (six categories, Thesis-heavy weighting, gates). "No data" is a
// first-class outcome: a metric that is null is EXCLUDED from scoring rather
// than counted as a fail, so a bank with no gross margin isn't punished for it.
// ---------------------------------------------------------------------------

// Everything a chip might need to read, for one ticker in one portfolio context.
export interface MetricContext {
  fundamentals?: FundamentalSnapshot;
  technicals?: TechnicalSnapshot;
  market: MarketContext;
  weightPct?: number; // this name's share of the portfolio book
  openPnlPct?: number; // unrealized P&L vs avg cost
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
  thesisPass: boolean;
  riskBreached: boolean;
  categories: CategoryScore[];
  results: ChipResult[];
}

const ALL_CATEGORIES: RuleCategory[] = [
  "thesis",
  "timeframe",
  "position",
  "setup",
  "risk",
  "trade",
];

// ---- Metric reads -------------------------------------------------------

export function readMetric(metric: MetricKey, ctx: MetricContext): MetricValue {
  const source = METRICS[metric]?.source;
  switch (source) {
    case "fundamental":
      return ctx.fundamentals ? ctx.fundamentals[metric as keyof FundamentalSnapshot] as MetricValue ?? null : null;
    case "technical":
      return ctx.technicals ? (ctx.technicals[metric as keyof TechnicalSnapshot] as MetricValue) ?? null : null;
    case "market":
      return (ctx.market[metric as keyof MarketContext] as MetricValue) ?? null;
    case "position":
      if (metric === "weightPct") return ctx.weightPct ?? null;
      if (metric === "openPnlPct") return ctx.openPnlPct ?? null;
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
      return (
        Array.isArray(target) && value >= target[0] && value <= target[1]
      );
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

  const pass = compareNumeric(value, chip.operator, chip.value);
  return { chip, outcome: pass ? "pass" : "fail", value };
}

// ---- Category scoring ---------------------------------------------------

function scoreCategory(
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
    (sum, result) => sum + Math.max(1, result.chip.weight),
    0,
  );
  const passWeight = scorable
    .filter((result) => result.outcome === "pass")
    .reduce((sum, result) => sum + Math.max(1, result.chip.weight), 0);
  const passCount = scorable.filter((result) => result.outcome === "pass").length;
  return {
    category,
    score: totalWeight > 0 ? Math.round((passWeight / totalWeight) * 100) : null,
    passCount,
    scorableCount: scorable.length,
  };
}

// ---- Thesis (boolean composite) -----------------------------------------

// AND within a group, OR across groups. A group is ignored-chip aware: no-data
// chips are skipped; a group passes if it has >= 1 chip with data and all of its
// data-bearing chips pass. A group of all no-data chips can't be confirmed → it
// fails. If a strategy has no thesis chips at all, the thesis does not gate.
export function evaluateThesis(
  strategy: Strategy,
  results: ChipResult[],
): boolean {
  const thesisResults = results.filter(
    (result) => result.chip.category === "thesis" && result.chip.enabled,
  );
  if (thesisResults.length === 0) return true; // no thesis defined → no gate

  const byId = new Map(thesisResults.map((result) => [result.chip.id, result]));

  // Default grouping: a single AND-group of every thesis chip.
  const groups =
    strategy.thesis && strategy.thesis.groups.length > 0
      ? strategy.thesis.groups
      : [thesisResults.map((result) => result.chip.id)];

  return groups.some((group) => {
    const groupResults = group
      .map((id) => byId.get(id))
      .filter((result): result is ChipResult => Boolean(result));
    const withData = groupResults.filter((result) => result.outcome !== "no-data");
    if (withData.length === 0) return false; // can't confirm → group fails
    return withData.every((result) => result.outcome === "pass");
  });
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
      thesisPass: true,
      riskBreached: false,
      categories: [],
      results: [],
    };
  }

  const results = rules.map((chip) => evaluateChip(chip, ctx));
  const categories = ALL_CATEGORIES.map((category) =>
    scoreCategory(category, results),
  );

  const weights: CategoryWeights =
    strategy.categoryWeights ?? DEFAULT_CATEGORY_WEIGHTS;

  // Weighted blend across categories that actually have scorable chips.
  let weightedSum = 0;
  let weightTotal = 0;
  for (const categoryScore of categories) {
    if (categoryScore.score == null) continue;
    const weight = weights[categoryScore.category] ?? 0;
    weightedSum += weight * categoryScore.score;
    weightTotal += weight;
  }
  const conviction = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

  const thesisPass = evaluateThesis(strategy, results);
  const riskBreached = results.some(
    (result) => result.chip.category === "risk" && result.outcome === "fail",
  );

  // Gates override the blended score (a fatal flaw can't be averaged away). They
  // also clamp the displayed conviction so the meter stays coherent with the
  // warning chip — a gated name never shows a high meter next to a red status.
  let status: StatusType;
  let gatedConviction = conviction;
  if (!thesisPass) {
    status = "Thesis Check";
    gatedConviction = Math.min(conviction, 39);
  } else if (riskBreached) {
    status = "Risk Check";
    gatedConviction = Math.min(conviction, 55);
  } else {
    status = statusFromConviction(conviction);
  }

  return {
    hasRules: true,
    conviction: gatedConviction,
    status,
    thesisPass,
    riskBreached,
    categories,
    results,
  };
}

// ---- Portfolio aggregate ------------------------------------------------

export interface WeightedAlignment {
  conviction: number; // market-value weight of this slice
  marketValue: number;
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
