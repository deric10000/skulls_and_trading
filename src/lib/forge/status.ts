import type { ResolvedStatus, RuleCategory, StatusType } from "../../types";
import type { CategoryScore } from "./scoring";

// ---------------------------------------------------------------------------
// Unified Forge status resolver — Layer 1 conviction band + Layer 2 category
// diagnostics + Layer 3 zone overlays (when zoneFlags are supplied). Conviction
// math is unchanged; this module only maps scores/flags to display labels
// (see docs/strategy-forge.md §4).
// ---------------------------------------------------------------------------

export interface ResolveContext {
  /** When false, Thesis Check fires regardless of scores. */
  hasStrategy: boolean;
  /**
   * Pre-evaluated Layer 3 zone labels (from evaluateZoneFlags). Filtered by
   * `zoneSurface` before merging into categoryFlags / primary.
   */
  zoneFlags?: StatusType[];
  /** ticker → Trim/Add only; portfolio → Go to Cash only. Default ticker. */
  zoneSurface?: "ticker" | "portfolio";
}

/** Lower index = more severe (wins primary headline). */
const SEVERITY_ORDER: StatusType[] = [
  "Go to Cash",
  "Trim Zone",
  "Add Zone",
  "Rule Break",
  "Rule Conflict",
  "Risk Drift",
  "Risk Check",
  "Review Risk",
  "Exit Review",
  "Trim Review",
  "Thesis Check",
  "Concentration Review",
  "Patience Review",
  "Watch Setup",
  "Hold Plan",
  "Review",
  "Watch",
  "Aligned",
  "High Alignment",
];

const TICKER_ZONES: StatusType[] = ["Trim Zone", "Add Zone"];
const PORTFOLIO_ZONES: StatusType[] = ["Go to Cash"];

function zoneFlagsForSurface(
  flags: StatusType[],
  surface: "ticker" | "portfolio",
): StatusType[] {
  const allowed = surface === "ticker" ? TICKER_ZONES : PORTFOLIO_ZONES;
  return flags.filter((flag) => allowed.includes(flag));
}

export function severityRank(status: StatusType): number {
  const index = SEVERITY_ORDER.indexOf(status);
  return index === -1 ? 999 : index;
}

function mostSevere(...statuses: StatusType[]): StatusType {
  return statuses.reduce((current, next) =>
    severityRank(next) < severityRank(current) ? next : current,
  );
}

/** Layer 1 — conviction band only. */
export function bandFromConviction(conviction: number): StatusType {
  if (conviction >= 80) return "High Alignment";
  if (conviction >= 60) return "Aligned";
  if (conviction >= 40) return "Watch";
  return "Review";
}

function categoryScore(
  categories: CategoryScore[],
  category: RuleCategory,
): number | null {
  return categories.find((item) => item.category === category)?.score ?? null;
}

function diagnosticForRisk(score: number | null): StatusType | null {
  if (score == null) return null;
  if (score < 40) return "Risk Drift";
  if (score < 50) return "Risk Check";
  if (score < 70) return "Review Risk";
  return null;
}

function diagnosticForThesis(score: number | null): StatusType | null {
  if (score == null) return null;
  if (score < 30) return "Rule Break";
  if (score < 45) return "Rule Conflict";
  if (score < 60) return "Thesis Check";
  return null;
}

function diagnosticForSetup(score: number | null): StatusType | null {
  if (score == null) return null;
  if (score >= 50 && score < 70) return "Watch Setup";
  return null;
}

function diagnosticForTrade(score: number | null): StatusType | null {
  if (score == null) return null;
  if (score < 30) return "Rule Break";
  if (score < 45) return "Exit Review";
  if (score < 55) return "Trim Review";
  if (score < 70) return "Hold Plan";
  return null;
}

function diagnosticForPosition(score: number | null): StatusType | null {
  if (score == null) return null;
  if (score >= 45 && score < 60) return "Concentration Review";
  return null;
}

function diagnosticForTimeframe(score: number | null): StatusType | null {
  if (score == null) return null;
  if (score >= 45 && score < 60) return "Patience Review";
  return null;
}

function addFlag(flags: StatusType[], label: StatusType | null): void {
  if (label && !flags.includes(label)) flags.push(label);
}

function collectCategoryFlags(categories: CategoryScore[]): StatusType[] {
  const flags: StatusType[] = [];
  addFlag(flags, diagnosticForRisk(categoryScore(categories, "risk")));
  addFlag(flags, diagnosticForThesis(categoryScore(categories, "thesis")));
  addFlag(flags, diagnosticForSetup(categoryScore(categories, "setup")));
  addFlag(flags, diagnosticForTrade(categoryScore(categories, "trade")));
  addFlag(flags, diagnosticForPosition(categoryScore(categories, "position")));
  addFlag(flags, diagnosticForTimeframe(categoryScore(categories, "timeframe")));
  return flags.sort((a, b) => severityRank(a) - severityRank(b));
}

export function resolveStatus(
  conviction: number,
  categories: CategoryScore[],
  ctx: ResolveContext,
): ResolvedStatus {
  const baseBand = bandFromConviction(conviction);

  if (!ctx.hasStrategy) {
    return {
      primary: "Thesis Check",
      categoryFlags: ["Thesis Check"],
      baseBand,
      conviction,
    };
  }

  const categoryFlags = collectCategoryFlags(categories);
  const zoneFlags = zoneFlagsForSurface(
    ctx.zoneFlags ?? [],
    ctx.zoneSurface ?? "ticker",
  );
  for (const flag of zoneFlags) addFlag(categoryFlags, flag);
  categoryFlags.sort((a, b) => severityRank(a) - severityRank(b));
  const primary = mostSevere(baseBand, ...categoryFlags);

  return {
    primary,
    categoryFlags,
    baseBand,
    conviction,
  };
}

export type CompassVariant = "bull" | "bear" | "placeholder";

/** Compass emblem driven by the primary status only. */
export function compassVariant(status: StatusType): CompassVariant {
  if (status === "High Alignment" || status === "Aligned") return "bull";
  if (status === "Risk Drift") return "bear";
  return "placeholder";
}

export interface WeightedCategorySlice {
  marketValue: number;
  conviction: number;
  categories: CategoryScore[];
}

/** Market-value-weighted average per category score across portfolio slices. */
export function aggregateCategoryScores(
  slices: WeightedCategorySlice[],
): CategoryScore[] {
  const totalValue = slices.reduce((sum, slice) => sum + slice.marketValue, 0);
  if (totalValue <= 0) return [];

  const categories: RuleCategory[] = [
    "thesis",
    "setup",
    "risk",
    "position",
    "trade",
    "timeframe",
  ];

  return categories.map((category) => {
    let weighted = 0;
    let participating = 0;
    for (const slice of slices) {
      const score = slice.categories.find((item) => item.category === category)?.score;
      if (score == null) continue;
      weighted += score * slice.marketValue;
      participating += slice.marketValue;
    }
    if (participating <= 0) {
      return { category, score: null, passCount: 0, scorableCount: 0 };
    }
    return {
      category,
      score: Math.round(weighted / participating),
      passCount: 0,
      scorableCount: 0,
    };
  });
}

export function resolveAggregatedStatus(
  slices: WeightedCategorySlice[],
  ctx: ResolveContext,
): ResolvedStatus {
  const totalValue = slices.reduce((sum, slice) => sum + slice.marketValue, 0);
  if (totalValue <= 0) return resolveStatus(0, [], ctx);

  const conviction = Math.round(
    slices.reduce((sum, slice) => sum + slice.conviction * slice.marketValue, 0) /
      totalValue,
  );
  const categories = aggregateCategoryScores(slices);
  return resolveStatus(conviction, categories, ctx);
}

/** Plan-safe copy for Strategy Check detail rows. */
export function statusCopy(status: StatusType): {
  reason: string;
  invalidation: string;
  nextLevel: string;
} {
  switch (status) {
    case "Thesis Check":
      return {
        reason: "No strategy is assigned yet, or fundamentals are weakening against your rules.",
        invalidation: "Assign a strategy and re-check once the thesis re-aligns.",
        nextLevel: "Assign or review your strategy in Strategy Forge.",
      };
    case "Rule Break":
      return {
        reason: "A core thesis or trade-management rule is failing.",
        invalidation: "The broken rule re-passes with fresh data.",
        nextLevel: "Review the failing chips before adding size.",
      };
    case "Rule Conflict":
      return {
        reason: "Fundamentals conflict with your stated thesis rules.",
        invalidation: "Metrics reconcile with your thesis thresholds.",
        nextLevel: "Check thesis chips for the conflict.",
      };
    case "Risk Drift":
      return {
        reason: "Structural risk rules are materially failing.",
        invalidation: "Risk category score recovers above your drift band.",
        nextLevel: "Review risk chips and portfolio exposure.",
      };
    case "Risk Check":
      return {
        reason: "Risk rules are under pressure — worth a deliberate review.",
        invalidation: "Risk score clears the check band.",
        nextLevel: "Confirm position size still matches your plan.",
      };
    case "Review Risk":
      return {
        reason: "Risk is soft-flagged — not broken, but no longer clean.",
        invalidation: "Risk score moves back into the clear band.",
        nextLevel: "Watch risk chips on the next refresh.",
      };
    case "Exit Review":
      return {
        reason: "Trade-management rules suggest reviewing an exit plan.",
        invalidation: "Price action reclaims your trade-management band.",
        nextLevel: "Check your stated exit rules.",
      };
    case "Trim Review":
      return {
        reason: "Gain or trim discipline may need attention.",
        invalidation: "Trade score improves after trim discipline resets.",
        nextLevel: "Review trim targets against your plan.",
      };
    case "Concentration Review":
      return {
        reason: "Position size is off relative to your sizing rules.",
        invalidation: "Weight returns to your target band.",
        nextLevel: "Check position-size chips.",
      };
    case "Patience Review":
      return {
        reason: "Hold cadence is off relative to your timeframe rules.",
        invalidation: "Timeframe score returns to the clear band.",
        nextLevel: "Review hold-timeframe chips.",
      };
    case "Watch Setup":
      return {
        reason: "Thesis may be fine, but the technical setup is not ready.",
        invalidation: "Setup score clears your entry band.",
        nextLevel: "Watch for your setup trigger.",
      };
    case "Hold Plan":
      return {
        reason: "Mixed trade-management signals — hold discipline applies.",
        invalidation: "Trade score clears the hold band.",
        nextLevel: "Stay with the plan unless rules break.",
      };
    case "High Alignment":
    case "Aligned":
      return {
        reason: "Your assigned rules line up with current data.",
        invalidation: "A category diagnostic or conviction drop breaks alignment.",
        nextLevel: "Monitor the next refresh against your plan.",
      };
    case "Watch":
      return {
        reason: "Conviction is mid-band — neither clearly aligned nor in review.",
        invalidation: "Conviction improves into the aligned band.",
        nextLevel: "Watch category chips for what is lagging.",
      };
    case "Review":
      return {
        reason: "Headline conviction is low across your active rules.",
        invalidation: "Conviction recovers above the review band.",
        nextLevel: "Review failing chips before acting.",
      };
    case "Trim Zone":
      return {
        reason: "A Trim Zone overlay rule is broken — take-profit / size-down territory.",
        invalidation: "Zone clears when every Trim Zone chip passes again.",
        nextLevel: "Follow your Trim Zone My Plan (partial trim, rebalance to plan size).",
      };
    case "Add Zone":
      return {
        reason: "An Add Zone overlay rule is broken — room to add while the plan still holds.",
        invalidation: "Zone clears when every Add Zone chip passes again.",
        nextLevel: "Follow your Add Zone My Plan (scale toward plan size if thesis/risk clear).",
      };
    case "Go to Cash":
      return {
        reason: "A Go to Cash overlay rule is broken — portfolio cash stance (SICADFU).",
        invalidation: "Stance clears when every Go to Cash chip passes again.",
        nextLevel: "Follow your Go to Cash My Plan; sit in cash until the trigger lifts.",
      };
    default:
      return {
        reason: "Strategy alignment reflects your Forge rules against current data.",
        invalidation: "Status changes when scores move across a band.",
        nextLevel: "Check Strategy Forge for the active rule set.",
      };
  }
}
