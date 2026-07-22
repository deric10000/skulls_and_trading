/**
 * Dynamic Free Tier sanity quarantine for fundamental snapshots.
 * Rule-based (MetricKey / cross-field) — not a one-off ticker list.
 * Absurd values → null (no-data); never fabricate replacements.
 */

import type { FundamentalSnapshot } from "../../types";

function finiteOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

/** Margins / growth-style percents that should live in a sane band. */
function quarantinePct(
  value: number | null | undefined,
  min: number,
  max: number,
): number | null {
  const v = finiteOrNull(value);
  if (v == null) return null;
  if (v < min || v > max) return null;
  return v;
}

function quarantineRatio(
  value: number | null | undefined,
  max: number,
): number | null {
  const v = finiteOrNull(value);
  if (v == null) return null;
  if (v < 0 || v > max) return null;
  return v;
}

/**
 * Sanitize a Free Tier fundamental snapshot before chips / UI consume it.
 * Safe to call repeatedly (idempotent on already-null fields).
 */
export function sanitizeFundamentals(
  snapshot: FundamentalSnapshot,
): FundamentalSnapshot {
  let next: FundamentalSnapshot = {
    ...snapshot,
    revenueGrowthPct: quarantinePct(snapshot.revenueGrowthPct, -100, 2000),
    epsGrowthPct: quarantinePct(snapshot.epsGrowthPct, -100, 2000),
    grossMarginPct: quarantinePct(snapshot.grossMarginPct, -50, 100),
    operatingMarginPct: quarantinePct(snapshot.operatingMarginPct, -500, 100),
    netMarginPct: quarantinePct(snapshot.netMarginPct, -500, 100),
    fcfMarginPct: quarantinePct(snapshot.fcfMarginPct, -500, 100),
    returnOnEquityPct: quarantinePct(snapshot.returnOnEquityPct, -500, 500),
    operatingCashFlow: finiteOrNull(snapshot.operatingCashFlow),
    netIncome: finiteOrNull(snapshot.netIncome),
    epsTtm: finiteOrNull(snapshot.epsTtm),
    peRatio: quarantineRatio(snapshot.peRatio, 500),
    forwardPE: quarantineRatio(snapshot.forwardPE, 500),
    // Extreme P/S is usually near-zero revenue noise on free Yahoo.
    priceToSales: quarantineRatio(snapshot.priceToSales, 200),
    evToEbitda: finiteOrNull(snapshot.evToEbitda),
    debtToEquity: quarantineRatio(snapshot.debtToEquity, 50),
    currentRatio: quarantineRatio(snapshot.currentRatio, 100),
    dividendYieldPct: quarantinePct(snapshot.dividendYieldPct, 0, 40),
    payoutRatioPct: quarantinePct(snapshot.payoutRatioPct, -50, 500),
  };

  // Cross-field: use pre-bound readings so extremes that later fail a single
  // field bound still wipe the contradictory pair when both look "real."
  const rawNet = finiteOrNull(snapshot.netMarginPct);
  const rawOp = finiteOrNull(snapshot.operatingMarginPct);
  if (rawNet != null && rawOp != null && rawNet > 50 && rawOp < -50) {
    next = {
      ...next,
      netMarginPct: null,
      operatingMarginPct: null,
    };
  }

  return next;
}
