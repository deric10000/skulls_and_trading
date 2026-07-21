/**
 * Derive which candle Times to fetch for each ticker from enabled timeframed
 * chips on applied strategies. Never blindly requests all 7 Times.
 */

import type { CandleInterval, RuleChip, Strategy } from "../../types";
import { isTimeframedMetric, METRICS } from "../forge/metrics";
import { LAYER3_ZONES } from "../forge/layer3Zones";

const CANDLE_SET = new Set<string>([
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1D",
  "1W",
  "1M",
]);

function collectChipTimes(strategy: Strategy, into: Set<CandleInterval>): void {
  const chipLists: RuleChip[][] = [
    strategy.rules ?? [],
    ...Object.values(LAYER3_ZONES).map((z) => strategy[z.rulesKey] ?? []),
  ];
  for (const chips of chipLists) {
    for (const chip of chips) {
      if (!chip.enabled) continue;
      if (!isTimeframedMetric(chip.metric)) continue;
      const meta = METRICS[chip.metric];
      let tf = chip.dateRange as string;
      // VWAP default / clamp: if an invalid Time slipped in, use metric default.
      if (!CANDLE_SET.has(tf) || !meta.dateRanges.includes(chip.dateRange)) {
        tf = meta.defaultDateRange;
      }
      if (CANDLE_SET.has(tf)) into.add(tf as CandleInterval);
    }
  }
}

/**
 * Union of candle Times needed by any applied strategy that can score the
 * given tickers. Always includes `1D` when any timeframed chip is present so
 * the legacy daily snapshot adapter stays warm.
 */
export function neededTimeframesForStrategies(
  strategies: Strategy[],
): CandleInterval[] {
  const times = new Set<CandleInterval>();
  for (const strategy of strategies) {
    collectChipTimes(strategy, times);
  }
  if (times.size > 0 && !times.has("1D")) times.add("1D");
  return [...times];
}
