/**
 * Worker-side Free Tier fundamental sanity (keep in sync with
 * src/lib/forge/metricSanity.ts). Worker cannot import src/.
 */

type NullableNum = number | null | undefined;

export type SanitizableFundamentals = {
  revenueGrowthPct?: NullableNum;
  epsGrowthPct?: NullableNum;
  grossMarginPct?: NullableNum;
  operatingMarginPct?: NullableNum;
  netMarginPct?: NullableNum;
  fcfMarginPct?: NullableNum;
  returnOnEquityPct?: NullableNum;
  operatingCashFlow?: NullableNum;
  netIncome?: NullableNum;
  epsTtm?: NullableNum;
  peRatio?: NullableNum;
  forwardPE?: NullableNum;
  priceToSales?: NullableNum;
  evToEbitda?: NullableNum;
  debtToEquity?: NullableNum;
  currentRatio?: NullableNum;
  dividendYieldPct?: NullableNum;
  payoutRatioPct?: NullableNum;
};

function finiteOrNull(value: NullableNum): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

function quarantinePct(value: NullableNum, min: number, max: number): number | null {
  const v = finiteOrNull(value);
  if (v == null) return null;
  if (v < min || v > max) return null;
  return v;
}

function quarantineRatio(value: NullableNum, max: number): number | null {
  const v = finiteOrNull(value);
  if (v == null) return null;
  if (v < 0 || v > max) return null;
  return v;
}

export function sanitizeFundamentals<T extends SanitizableFundamentals>(
  snapshot: T,
): T {
  let next = {
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
    priceToSales: quarantineRatio(snapshot.priceToSales, 200),
    evToEbitda: finiteOrNull(snapshot.evToEbitda),
    debtToEquity: quarantineRatio(snapshot.debtToEquity, 50),
    currentRatio: quarantineRatio(snapshot.currentRatio, 100),
    dividendYieldPct: quarantinePct(snapshot.dividendYieldPct, 0, 40),
    payoutRatioPct: quarantinePct(snapshot.payoutRatioPct, -50, 500),
  } as T;

  const rawNet = finiteOrNull(snapshot.netMarginPct);
  const rawOp = finiteOrNull(snapshot.operatingMarginPct);
  if (
    typeof rawNet === "number" &&
    typeof rawOp === "number" &&
    rawNet > 50 &&
    rawOp < -50
  ) {
    next = {
      ...next,
      netMarginPct: null,
      operatingMarginPct: null,
    };
  }

  return next;
}
