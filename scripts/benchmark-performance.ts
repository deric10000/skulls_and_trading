/**
 * Deterministic scoring-bridge guardrail at Beta scale.
 * This measures orchestration around the pure Forge engine; it does not change
 * scoring inputs or algorithms.
 */
import { performance } from "node:perf_hooks";
import { DEFAULT_BUCKETS, DEFAULT_STRATEGIES } from "../src/data";
import { computePortfolioAlignment } from "../src/lib/forge/alignment";
import type { Portfolio, Strategy } from "../src/types";

const TICKER_CAP = 40;
const WARMUP_ITERATIONS = 5;
const ITERATIONS = 40;
const P95_BASELINE_MS = 9;
const P95_LIMIT_MS = P95_BASELINE_MS * 1.1;
const SCORE_CALL_BASELINE = 120;
const SCORE_CALL_LIMIT = SCORE_CALL_BASELINE * 1.1;

const strategySeed = DEFAULT_STRATEGIES.slice(0, 5);
const strategies: Strategy[] = strategySeed.map((strategy) => ({
  ...strategy,
  appliedPortfolioIds: ["performance-book"],
}));
const portfolio: Portfolio = {
  id: "performance-book",
  label: "Synthetic performance fixture",
  type: "portfolio",
  holdings: Array.from({ length: TICKER_CAP }, (_, index) => ({
    ticker: `PERF${String(index).padStart(2, "0")}`,
    shares: 1,
    avgPrice: 100,
    openPnlPct: 0,
    conviction: 0,
    status: "Watch",
    reason: "",
    strategyIds: strategies.map((strategy) => strategy.id),
  })),
};

// Warm module/data caches and the JIT before collecting the local ceiling.
// A single warm-up left the p95 dominated by process-start variance.
for (let index = 0; index < WARMUP_ITERATIONS; index += 1) {
  computePortfolioAlignment(portfolio, DEFAULT_BUCKETS, strategies, {
    caller: "benchmark",
  });
}
performance.clearMarks();

const durations: number[] = [];
for (let index = 0; index < ITERATIONS; index += 1) {
  const start = performance.now();
  computePortfolioAlignment(portfolio, DEFAULT_BUCKETS, strategies, {
    caller: "benchmark",
  });
  durations.push(performance.now() - start);
}

durations.sort((a, b) => a - b);
const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
const scoreCalls =
  performance
    .getEntriesByName("st:count:score-stock", "mark")
    .reduce((sum, entry) => {
      const amount = Number((entry as PerformanceMark).detail?.amount ?? 1);
      return sum + amount;
    }, 0) / ITERATIONS;

console.log(
  `Scoring bridge: p95 ${p95.toFixed(2)} ms; ${scoreCalls.toFixed(0)} scoreStock calls/run ` +
    `(${TICKER_CAP} tickers, ${strategies.length} applied strategies).`,
);

if (p95 > P95_LIMIT_MS) {
  console.error(`p95 exceeds ${P95_LIMIT_MS} ms ceiling.`);
  process.exitCode = 1;
}
if (scoreCalls > SCORE_CALL_LIMIT) {
  console.error(`scoreStock calls exceed ${SCORE_CALL_LIMIT} ceiling.`);
  process.exitCode = 1;
}

