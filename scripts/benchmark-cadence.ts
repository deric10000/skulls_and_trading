/**
 * Deterministic guardrail for cadence calendar arithmetic. The fixture spans
 * DST, weekends, month ends, and stale timestamps without elapsed-time walks.
 */
import { performance } from "node:perf_hooks";
import type { CheckInterval } from "../src/types";
import {
  latestCadenceBoundaryMs,
  nextCadenceBoundaryMs,
} from "../src/lib/forge/cadenceBoundaries";

const INTERVALS: CheckInterval[] = [
  "1h",
  "2h",
  "4h",
  "1D",
  "1W",
  "1M",
  "close-premarket",
  "close-regular",
  "close-afterhours",
  "close-overnight",
];
const FIXTURES = [
  Date.parse("2020-01-01T00:00:00.000Z"),
  Date.parse("2026-03-08T06:30:00.000Z"),
  Date.parse("2026-07-27T21:17:00.000Z"),
  Date.parse("2026-11-01T04:30:00.000Z"),
];
const ITERATIONS = 20;
const ROUNDS_PER_ITERATION = 25;
const P95_BASELINE_MS = 15;
const P95_LIMIT_MS = P95_BASELINE_MS * 1.1;

function runFixture(): number {
  let checksum = 0;
  for (let round = 0; round < ROUNDS_PER_ITERATION; round += 1) {
    for (const atMs of FIXTURES) {
      for (const interval of INTERVALS) {
        checksum += nextCadenceBoundaryMs(interval, atMs) % 97;
        checksum += latestCadenceBoundaryMs(interval, atMs) % 89;
      }
    }
  }
  return checksum;
}

runFixture();
const durations: number[] = [];
let checksum = 0;
for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
  const start = performance.now();
  checksum += runFixture();
  durations.push(performance.now() - start);
}

durations.sort((left, right) => left - right);
const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
const operations =
  ROUNDS_PER_ITERATION * FIXTURES.length * INTERVALS.length * 2;

console.log(
  `Cadence arithmetic: p95 ${p95.toFixed(2)} ms for ${operations} boundaries ` +
    `(checksum ${checksum}).`,
);

if (p95 > P95_LIMIT_MS) {
  console.error(`Cadence p95 exceeds ${P95_LIMIT_MS.toFixed(1)} ms ceiling.`);
  process.exitCode = 1;
}
