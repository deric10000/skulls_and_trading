import { performance } from "node:perf_hooks";
import { DEFAULT_STRATEGIES, MARKET_CONTEXT } from "../src/data";
import { BETA0_MAX_ACTIVE_CHIPS } from "../src/lib/forge/budgets";
import type { Portfolio, RuleChip, Strategy } from "../src/types";
import {
  scoreCombinedAuthority,
  scoreStrategyCheck,
  type CompleteMarketCycle,
  type Workspace,
} from "../supabase/functions/_shared/alignment";
import { dispatchConvictionCycle } from "../worker/convictionDispatch";
import {
  MAX_GLOBAL_SYMBOLS,
  MAX_SYMBOLS_PER_USER,
  shardCapacityPlan,
} from "../worker/marketCycle";

const USER_COUNT = 20;
const STRATEGIES_PER_USER = 5;
const QUEUE_MESSAGES_PER_DAY = 24;
const QUEUE_MAX_RETRIES = 5;
const QUEUE_CPU_LIMIT_MS = 10;
const EDGE_CPU_LIMIT_MS = 2_000;
const EDGE_WALL_LIMIT_MS = 150_000;
const EDGE_CPU_RELEASE_GATE_MS = 1_500;
const EDGE_WALL_RELEASE_GATE_MS = 120_000;
const FORWARD_ITERATIONS = 1_000;

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * percentileValue) - 1] ?? Infinity;
}

function strategyRules(seed: Strategy, strategyIndex: number): RuleChip[] {
  const source = (seed.rules ?? []).filter((rule) => rule.enabled);
  if (source.length === 0) throw new Error("Scale fixture needs seeded rules");
  const perStrategy = BETA0_MAX_ACTIVE_CHIPS / STRATEGIES_PER_USER;
  return Array.from({ length: perStrategy }, (_, index) => ({
    ...source[index % source.length]!,
    id: `scale-${strategyIndex}-${index}`,
    enabled: true,
  }));
}

const strategySeeds = Array.from(
  { length: STRATEGIES_PER_USER },
  (_, index) => DEFAULT_STRATEGIES[index % DEFAULT_STRATEGIES.length]!,
);
const strategies = strategySeeds.map((seed, index): Strategy => ({
  ...seed,
  id: `scale-strategy-${index}`,
  appliedPortfolioIds: ["scale-book"],
  rules: strategyRules(seed, index),
}));
const activeChips = strategies.reduce(
  (sum, strategy) =>
    sum + (strategy.rules ?? []).filter((rule) => rule.enabled).length,
  0,
);

const allSymbols = Array.from(
  { length: MAX_GLOBAL_SYMBOLS },
  (_, index) => `S${String(index).padStart(4, "0")}`,
);
const quotes = Object.fromEntries(
  allSymbols.map((ticker, index) => [
    ticker,
    {
      lastPrice: 100 + (index % 25),
      asOf: "2026-07-27T20:00:00.000Z",
      source: "scale-fixture",
    },
  ]),
);
const emptyMetrics = Object.fromEntries(allSymbols.map((ticker) => [ticker, {}]));
const cycle: CompleteMarketCycle = {
  schemaVersion: 1,
  complete: true,
  cycleKey: "market:cycle:complete:scale",
  cycleAsOf: "2026-07-27T20:00:00.000Z",
  quotes,
  fundamentals: emptyMetrics,
  technicals: emptyMetrics,
  byTimeframe: emptyMetrics,
  context: MARKET_CONTEXT,
};

const workspaces: Workspace[] = Array.from({ length: USER_COUNT }, (_, user) => {
  const symbols = allSymbols.slice(
    user * MAX_SYMBOLS_PER_USER,
    (user + 1) * MAX_SYMBOLS_PER_USER,
  );
  const portfolio: Portfolio = {
    id: "scale-book",
    label: `Scale book ${user}`,
    type: "portfolio",
    holdings: symbols.map((ticker) => ({
      ticker,
      shares: 1,
      avgPrice: 100,
      openPnlPct: 0,
      conviction: 0,
      status: "Watch",
      reason: "",
      strategyIds: strategies.map((strategy) => strategy.id),
    })),
  };
  return { portfolios: [portfolio], strategies };
});

// Warm JIT/module paths outside the measurement.
scoreStrategyCheck(workspaces[0]!, strategies[0]!.id, "1h", cycle);
scoreCombinedAuthority(workspaces[0]!, cycle);

const cpuStart = process.cpuUsage();
const wallStart = performance.now();
let scoredTickerStrategies = 0;
let scoredCombinedHeadlines = 0;
for (const workspace of workspaces) {
  const combined = scoreCombinedAuthority(workspace, cycle);
  for (const strategy of strategies) {
    const output = scoreStrategyCheck(
      workspace,
      strategy.id,
      "1h",
      cycle,
    );
    scoredTickerStrategies += output.results.length;
    scoredCombinedHeadlines += combined.combinedResults.filter((result) =>
      result.strategy_ids.includes(strategy.id)
    ).length;
  }
}
const edgeWallMs = performance.now() - wallStart;
const cpu = process.cpuUsage(cpuStart);
const edgeCpuMs = (cpu.user + cpu.system) / 1_000;

const forwardingCpuMs: number[] = [];
const forwardingWallMs: number[] = [];
const fetcher: typeof fetch = async () =>
  new Response('{"ok":true}', { status: 200 });
for (let index = 0; index < FORWARD_ITERATIONS; index += 1) {
  const iterationCpu = process.cpuUsage();
  const iterationWall = performance.now();
  await dispatchConvictionCycle(
    {
      version: 1,
      cycleKey: "market:cycle:complete:scale",
      cycleAsOf: "2026-07-27T20:00:00.000Z",
    },
    {
      SUPABASE_CONVICTION_FUNCTION_URL: "https://example.test/edge",
      INTERNAL_SCORING_SECRET: "benchmark-secret",
    },
    fetcher,
  );
  const iterationUsage = process.cpuUsage(iterationCpu);
  forwardingCpuMs.push((iterationUsage.user + iterationUsage.system) / 1_000);
  forwardingWallMs.push(performance.now() - iterationWall);
}

const shardPlan = shardCapacityPlan(MAX_GLOBAL_SYMBOLS);
const normalQueueOperations = QUEUE_MESSAGES_PER_DAY * 3;
const deadLetterQueueOperations =
  QUEUE_MESSAGES_PER_DAY * (1 + (1 + QUEUE_MAX_RETRIES) + 1);
const results = {
  fixture: {
    users: USER_COUNT,
    uniqueSymbols: allSymbols.length,
    symbolsPerUser: MAX_SYMBOLS_PER_USER,
    strategiesPerUser: strategies.length,
    activeChipsPerUser: activeChips,
    scoredTickerStrategies,
    scoredCombinedHeadlines,
  },
  queue: {
    normalOperationsPerDay: normalQueueOperations,
    allMessagesDeadLetterOperationsPerDay: deadLetterQueueOperations,
    freeOperationsPerDay: 10_000,
    forwardingCpuP95Ms: percentile(forwardingCpuMs, 0.95),
    forwardingWallP95Ms: percentile(forwardingWallMs, 0.95),
    workerCpuLimitMs: QUEUE_CPU_LIMIT_MS,
  },
  edge: {
    cpuMs: edgeCpuMs,
    wallMs: edgeWallMs,
    platformCpuLimitMs: EDGE_CPU_LIMIT_MS,
    platformWallLimitMs: EDGE_WALL_LIMIT_MS,
    releaseCpuGateMs: EDGE_CPU_RELEASE_GATE_MS,
    releaseWallGateMs: EDGE_WALL_RELEASE_GATE_MS,
  },
  shardPlan,
};

console.log(JSON.stringify(results, null, 2));

const failures: string[] = [];
if (activeChips !== BETA0_MAX_ACTIVE_CHIPS) {
  failures.push(`active chips ${activeChips}/${BETA0_MAX_ACTIVE_CHIPS}`);
}
if (scoredTickerStrategies !== USER_COUNT * MAX_SYMBOLS_PER_USER * 5) {
  failures.push(`scored ticker-strategies ${scoredTickerStrategies}/4000`);
}
if (scoredCombinedHeadlines !== USER_COUNT * MAX_SYMBOLS_PER_USER * 5) {
  failures.push(`combined headlines ${scoredCombinedHeadlines}/4000`);
}
if (normalQueueOperations >= 10_000 || deadLetterQueueOperations >= 10_000) {
  failures.push("Queue operations exceed Free-plan gate");
}
if (percentile(forwardingCpuMs, 0.95) >= QUEUE_CPU_LIMIT_MS) {
  failures.push("Queue forwarding CPU p95 exceeds 10 ms");
}
if (edgeCpuMs >= EDGE_CPU_RELEASE_GATE_MS) {
  failures.push("Local Edge-adapter CPU exceeds 1.5 s release gate");
}
if (edgeWallMs >= EDGE_WALL_RELEASE_GATE_MS) {
  failures.push("Local Edge-adapter wall time exceeds 120 s release gate");
}
if (
  shardPlan.retrySlotsPerPhase < 1 ||
  shardPlan.maxExternalSubrequestsPerShard > 50
) {
  failures.push("Shard packing has no retry slack or exceeds 50 subrequests");
}
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
}
