/**
 * Free-tier live metric coverage (Phase 3 chip coverage map).
 * Layer 1: only these keys appear in Forge rule dropdowns / should stay on defaults.
 * Keys omitted here are unsupported on free Yahoo/Finnhub/FRED paths — see the
 * "excluded" note at the bottom for exactly why each one is out.
 */

import type { MetricKey } from "../../types";

/** Metrics FreeTier Worker paths can populate (Yahoo fundy/tech + FRED/macro). */
export const LIVE_SUPPORTED_METRIC_KEYS = new Set<MetricKey>([
  // Fundamentals (Yahoo quoteSummary: financialData / defaultKeyStatistics /
  // summaryDetail)
  "revenueGrowthPct",
  "epsGrowthPct",
  "epsTtm",
  "grossMarginPct",
  "operatingMarginPct",
  "netMarginPct",
  "fcfMarginPct",
  "netIncome",
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
  // Timeframed technicals (Worker computes from Yahoo OHLCV per candle Time)
  "rsi",
  "stochK",
  "stochD",
  "stochRsi",
  "williamsR",
  "cci",
  "macdHistogram",
  "macdLine",
  "macdSignal",
  "roc",
  "priceAboveSma20",
  "priceAboveSma50",
  "priceAboveSma200",
  "priceVsEma10Pct",
  "priceVsEma20Pct",
  "priceVsEma50Pct",
  "adx",
  "plusDi",
  "minusDi",
  "aroonUp",
  "aroonDown",
  "aroonOsc",
  "atrPct",
  "bollingerPercentB",
  "bollingerBandwidth",
  "donchianPosition",
  "relativeVolume",
  "priceVsVwapPct",
  "mfi",
  "chaikinMoneyFlow",
  "obvChange20",
  // Non-timeframed technicals / risk (daily snapshot)
  "drawdownFrom52wHighPct",
  "priceChange3mPct",
  "daysUntilEarnings",
  "beta1y",
  "avgDollarVolume20d",
  "sectorEtf1mChangePct",
  // Market context (SPY/^VIX charts + FRED DGS10 / BAMLH0A0HYM2)
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

// Excluded from free-tier coverage — no honest source on Yahoo/Finnhub/FRED
// free paths (do NOT re-add without a real feed; a fabricated value is worse
// than "no data"):
// - interestCoverage    — needs income-statement interest expense (paid/filings)
// - dividendGrowth5yPct — needs 5Y dividend history (free modules only carry
//                         current yield/rate + 5Y AVG YIELD, not growth)
// - buybackYieldPct     — needs YoY share-count change (only current shares
//                         outstanding is exposed)

export function isLiveSupportedMetric(key: MetricKey): boolean {
  return LIVE_SUPPORTED_METRIC_KEYS.has(key);
}
