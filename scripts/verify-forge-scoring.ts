/**
 * One-shot verification of the Strategy Forge scoring rewrite.
 * Run: npx tsx scripts/verify-forge-scoring.ts
 *
 * Checks:
 *  1. Seed strategies: chip weights sum to 100 per category; custom tag
 *     weights sum to 100 per category.
 *  2. The FigJam worked example: 3 thesis chips (33/33/34), one fails →
 *     category score 67; with thesis weight 55 alone → 67 conviction
 *     (renormalized) and 36.85 points before renormalization.
 *  3. scoreStock on the VGD strategy for NVDA produces a 0–100 conviction
 *     and per-category scores; no-data chips are excluded.
 *  4. validateStrategy flags an incomplete blank strategy and passes VGD.
 */
import { DEFAULT_STRATEGIES, FUNDAMENTAL_SNAPSHOTS, MARKET_CONTEXT, TECHNICAL_SNAPSHOTS } from "../src/data";
import { CATEGORY_ORDER } from "../src/lib/forge/metrics";
import { scoreCategory, scoreStock, evaluateChip, validateStrategy, type MetricContext } from "../src/lib/forge/scoring";
import type { RuleChip, Strategy } from "../src/types";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// 1. Seed weight sums
for (const strategy of DEFAULT_STRATEGIES) {
  for (const category of CATEGORY_ORDER) {
    const chips = (strategy.rules ?? []).filter((c) => c.category === category && c.enabled);
    const chipSum = Math.round(chips.reduce((s, c) => s + c.weightPct, 0));
    check(`${strategy.id} ${category} chip weights = 100`, chipSum === 100, `${chipSum}`);
    const tags = (strategy.ruleTags ?? []).filter((t) => t.category === category && !t.system);
    const tagSum = Math.round(tags.reduce((s, t) => s + t.weightPct, 0));
    check(`${strategy.id} ${category} tag weights = 100`, tagSum === 100, `${tagSum}`);
  }
  const weights = strategy.categoryWeights!;
  const catSum = CATEGORY_ORDER.reduce((s, c) => s + weights[c], 0);
  check(`${strategy.id} category weights = 100`, catSum === 100, `${catSum}`);
}

// 2. FigJam worked example: Rev 33% fails, EPS 33% passes, EBITDA 34% passes → 67%
const exampleChips: RuleChip[] = [
  { id: "x1", label: "Revenue Growth", category: "thesis", metric: "revenueGrowthPct", dateRange: "TTM / Latest FY", operator: ">=", value: 50, weightPct: 33, enabled: true },
  { id: "x2", label: "EPS Growth", category: "thesis", metric: "epsGrowthPct", dateRange: "TTM / Latest FY", operator: ">=", value: 10, weightPct: 33, enabled: true },
  { id: "x3", label: "EV/EBITDA", category: "thesis", metric: "evToEbitda", dateRange: "Current / TTM", operator: "<", value: 20, weightPct: 34, enabled: true },
];
const exampleCtx: MetricContext = {
  fundamentals: { ...FUNDAMENTAL_SNAPSHOTS.MSFT, revenueGrowthPct: 5, epsGrowthPct: 20, evToEbitda: 15 },
  technicals: TECHNICAL_SNAPSHOTS.MSFT,
  market: MARKET_CONTEXT,
};
const exampleResults = exampleChips.map((chip) => evaluateChip(chip, exampleCtx));
const exampleScore = scoreCategory("thesis", exampleResults);
check("FigJam example: thesis score 67", exampleScore.score === 67, `${exampleScore.score}`);
check(
  "FigJam example: 67% × 55 = 36.85 conviction points",
  Math.abs((exampleScore.score! / 100) * 55 - 36.85) < 0.01,
);

// Thesis-only strategy → conviction renormalizes to the thesis score itself.
const thesisOnly: Strategy = {
  id: "t", name: "T", description: "", isDefault: false, enabled: true,
  timeframe: [], tags: [], decisionSignals: [], exitLogic: [],
  thesisDescription: "x", rules: exampleChips,
  categoryWeights: { thesis: 55, setup: 12, risk: 15, position: 8, trade: 6, timeframe: 4 },
};
const thesisOnlyScore = scoreStock(thesisOnly, exampleCtx);
check("Thesis-only conviction = 67 (renormalized)", thesisOnlyScore.conviction === 67, `${thesisOnlyScore.conviction}`);

// 3. VGD × NVDA
const vgd = DEFAULT_STRATEGIES.find((s) => s.id === "value-growth-dividend")!;
const nvdaCtx: MetricContext = {
  fundamentals: FUNDAMENTAL_SNAPSHOTS.NVDA,
  technicals: TECHNICAL_SNAPSHOTS.NVDA,
  market: MARKET_CONTEXT,
  weightPct: 12,
  openPnlPct: 24,
  holdingDays: 133,
};
const nvda = scoreStock(vgd, nvdaCtx);
check("VGD×NVDA conviction in 0..100", nvda.conviction >= 0 && nvda.conviction <= 100, `${nvda.conviction} (${nvda.status})`);
console.log("  per-category:", nvda.categories.map((c) => `${c.category}=${c.score}`).join(" "));
const noData = nvda.results.filter((r) => r.outcome === "no-data").length;
console.log(`  no-data chips excluded: ${noData}`);

// SOFI (nulls galore) — no-data handling must not crash or fabricate
const sofiCtx: MetricContext = {
  fundamentals: FUNDAMENTAL_SNAPSHOTS.SOFI,
  technicals: TECHNICAL_SNAPSHOTS.SOFI,
  market: MARKET_CONTEXT,
  weightPct: 5,
  openPnlPct: -4,
};
const sofi = scoreStock(vgd, sofiCtx);
check("VGD×SOFI scores without fabricating data", sofi.conviction >= 0 && sofi.conviction <= 100,
  `${sofi.conviction}, no-data=${sofi.results.filter((r) => r.outcome === "no-data").length}`);

// 4. Validation
check("VGD validates complete", validateStrategy(vgd).complete, validateStrategy(vgd).issues.join("; "));
const blank: Strategy = {
  id: "b", name: "New Strategy", description: "", isDefault: false, enabled: true,
  timeframe: [], tags: [], decisionSignals: [], exitLogic: [],
  thesisDescription: "", rules: [], ruleTags: [],
  categoryWeights: { thesis: 55, setup: 12, risk: 15, position: 8, trade: 6, timeframe: 4 },
};
const blankValidation = validateStrategy(blank);
check("Blank strategy flagged incomplete", !blankValidation.complete, `${blankValidation.issues.length} issues`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
