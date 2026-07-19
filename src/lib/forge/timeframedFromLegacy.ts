/**
 * Adapt a legacy daily TechnicalSnapshot into TimeframedIndicators for
 * scoring when live byTimeframe data is missing (mock / cold cache).
 */

import type {
  CandleInterval,
  TechnicalSnapshot,
  TimeframedIndicators,
} from "../../types";

function emptyIndicators(asOf: string): TimeframedIndicators {
  return {
    rsi: null,
    stochK: null,
    stochD: null,
    stochRsi: null,
    williamsR: null,
    cci: null,
    macdHistogram: null,
    macdLine: null,
    macdSignal: null,
    roc: null,
    priceAboveSma20: null,
    priceAboveSma50: null,
    priceAboveSma200: null,
    priceVsEma10Pct: null,
    priceVsEma20Pct: null,
    priceVsEma50Pct: null,
    adx: null,
    plusDi: null,
    minusDi: null,
    aroonUp: null,
    aroonDown: null,
    aroonOsc: null,
    atrPct: null,
    bollingerPercentB: null,
    bollingerBandwidth: null,
    donchianPosition: null,
    relativeVolume: null,
    priceVsVwapPct: null,
    mfi: null,
    chaikinMoneyFlow: null,
    obvChange20: null,
    asOf,
  };
}

/** Map daily legacy fields → TimeframedIndicators @ 1D. */
export function legacySnapshotTo1D(
  snap: TechnicalSnapshot,
): TimeframedIndicators {
  return {
    ...emptyIndicators(snap.asOf),
    rsi: snap.rsi14,
    priceAboveSma20: snap.priceAbove20dSma,
    priceAboveSma50: snap.priceAbove50dSma,
    priceAboveSma200: snap.priceAbove200dSma,
    priceVsEma10Pct: snap.priceVs10EmaPct,
    priceVsEma20Pct: snap.priceVs20EmaPct,
    priceVsEma50Pct: snap.priceVs50EmaPct,
    atrPct: snap.atrPct14d,
    relativeVolume: snap.relativeVolume,
    priceVsVwapPct: snap.priceVsVwapPct,
    asOf: snap.asOf,
  };
}

/** weeklyRsi only — other indicators stay null at 1W from legacy. */
export function legacySnapshotTo1W(
  snap: TechnicalSnapshot,
): TimeframedIndicators {
  return {
    ...emptyIndicators(snap.asOf),
    rsi: snap.weeklyRsi,
    asOf: snap.asOf,
  };
}

/**
 * Build a by-timeframe map from a legacy snapshot (+ optional live overlays).
 * Live entries win when present.
 */
export function mergeTechnicalsByTimeframe(
  legacy: TechnicalSnapshot | undefined,
  live: Partial<Record<CandleInterval, TimeframedIndicators>> | undefined,
): Partial<Record<CandleInterval, TimeframedIndicators>> {
  const out: Partial<Record<CandleInterval, TimeframedIndicators>> = {
    ...(live ?? {}),
  };
  if (legacy) {
    if (!out["1D"]) out["1D"] = legacySnapshotTo1D(legacy);
    if (!out["1W"]) out["1W"] = legacySnapshotTo1W(legacy);
  }
  return out;
}
