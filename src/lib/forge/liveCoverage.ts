/**
 * Free-tier live metric coverage (Phase 3 chip coverage map).
 * Layer 1: only these keys appear in Forge rule dropdowns / should stay on defaults.
 * Keys omitted here are unsupported on free Yahoo/Finnhub/FRED paths for Beta 0.
 */

import type { MetricKey } from "../../types";

/** Metrics FreeTier Worker paths can populate (Yahoo fundy/tech + FRED/macro). */
export const LIVE_SUPPORTED_METRIC_KEYS = new Set<MetricKey>([
  // Fundamentals (Yahoo quoteSummary)
  "revenueGrowthPct",
  "epsGrowthPct",
  "grossMarginPct",
  "operatingMarginPct",
  "netMarginPct",
  "returnOnEquityPct",
  "operatingCashFlow",
  "peRatio",
  "forwardPE",
  "priceToSales",
  "evToEbitda",
  "debtToEquity",
  "currentRatio",
  "dividendYieldPct",
  "payoutRatioPct",
  "beta1y",
  // Technicals (Yahoo chart)
  "priceAbove200dSma",
  "priceAbove50dSma",
  "priceAbove20dSma",
  "rsi14",
  "drawdownFrom52wHighPct",
  "priceChange3mPct",
  "relativeVolume",
  "avgDollarVolume20d",
  // Market context
  "vix",
  "spyRsi",
  "spyAbove200dSma",
  "spy5dChangePct",
  "treasury10y5dChangePct",
  "highYieldSpreadPct",
  // Position / qualitative — always local, not vendor-fed
  "weightPct",
  "openPnlPct",
  "holdingDays",
  "timeframe",
]);

export function isLiveSupportedMetric(key: MetricKey): boolean {
  return LIVE_SUPPORTED_METRIC_KEYS.has(key);
}
