/**
 * Migrates stored RuleChips from pre–timeframed MetricKeys to the indicator +
 * Time model. Operators / values / weights are untouched so conviction at Time
 * = 1D matches the old daily reads.
 */

import type { DateRange, MetricKey, RuleChip, Strategy } from "../../types";
import { LAYER3_ZONES } from "./layer3Zones";

/** Old MetricKey → new key + default Time (candle). */
const LEGACY_METRIC_MAP: Record<
  string,
  { metric: MetricKey; dateRange: DateRange }
> = {
  rsi14: { metric: "rsi", dateRange: "1D" },
  weeklyRsi: { metric: "rsi", dateRange: "1W" },
  priceAbove200dSma: { metric: "priceAboveSma200", dateRange: "1D" },
  priceAbove50dSma: { metric: "priceAboveSma50", dateRange: "1D" },
  priceAbove20dSma: { metric: "priceAboveSma20", dateRange: "1D" },
  priceVs10EmaPct: { metric: "priceVsEma10Pct", dateRange: "1D" },
  priceVs20EmaPct: { metric: "priceVsEma20Pct", dateRange: "1D" },
  priceVs50EmaPct: { metric: "priceVsEma50Pct", dateRange: "1D" },
  atrPct14d: { metric: "atrPct", dateRange: "1D" },
};

export function migrateChipMetric(chip: RuleChip): RuleChip {
  const mapped = LEGACY_METRIC_MAP[chip.metric as string];
  if (!mapped) return chip;
  return {
    ...chip,
    metric: mapped.metric,
    dateRange: mapped.dateRange,
  };
}

export function migrateChips(chips: RuleChip[] | undefined): RuleChip[] {
  return (chips ?? []).map(migrateChipMetric);
}

/** Apply legacy key→Time migration across a strategy body. */
export function migrateStrategyMetrics(strategy: Strategy): Strategy {
  const next: Strategy = {
    ...strategy,
    rules: migrateChips(strategy.rules),
  };
  for (const zone of Object.values(LAYER3_ZONES)) {
    const rules = strategy[zone.rulesKey];
    if (rules) {
      next[zone.rulesKey] = migrateChips(rules);
    }
  }
  return next;
}
