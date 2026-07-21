/**
 * Pure OHLCV → comprehensive-core technical indicators.
 * Used by worker/market.ts per candle timeframe. Insufficient bars → null.
 */

export interface OhlcvBar {
  t: number; // epoch seconds
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export type CandleTime =
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1D"
  | "1W"
  | "1M";

export interface TimeframedIndicatorsPayload {
  rsi: number | null;
  stochK: number | null;
  stochD: number | null;
  stochRsi: number | null;
  williamsR: number | null;
  cci: number | null;
  macdHistogram: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  roc: number | null;
  priceAboveSma20: number | null;
  priceAboveSma50: number | null;
  priceAboveSma200: number | null;
  priceVsEma10Pct: number | null;
  priceVsEma20Pct: number | null;
  priceVsEma50Pct: number | null;
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
  aroonUp: number | null;
  aroonDown: number | null;
  aroonOsc: number | null;
  atrPct: number | null;
  bollingerPercentB: number | null;
  bollingerBandwidth: number | null;
  donchianPosition: number | null;
  relativeVolume: number | null;
  priceVsVwapPct: number | null;
  mfi: number | null;
  chaikinMoneyFlow: number | null;
  obvChange20: number | null;
  asOf: string;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i += 1) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

/** Full EMA series (same length as values; leading nulls until seeded). */
function emaSeries(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = value;
  for (let i = period; i < values.length; i += 1) {
    value = values[i] * k + value * (1 - k);
    out[i] = value;
  }
  return out;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** RSI series for Stochastic RSI (simple average method, matches rsi()). */
function rsiSeries(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  for (let end = period; end < values.length; end += 1) {
    let gains = 0;
    let losses = 0;
    for (let i = end - period + 1; i <= end; i += 1) {
      const delta = values[i] - values[i - 1];
      if (delta >= 0) gains += delta;
      else losses -= delta;
    }
    if (losses === 0) out[end] = 100;
    else {
      const rs = gains / losses;
      out[end] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function atrPct(bars: OhlcvBar[], period = 14): number | null {
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    if (high == null || low == null) continue;
    ranges.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }
  if (ranges.length < period) return null;
  const atr = ranges.slice(-period).reduce((a, b) => a + b, 0) / period;
  const last = bars[bars.length - 1]?.close;
  return last ? (atr / last) * 100 : null;
}

function trueRanges(bars: OhlcvBar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const { high, low } = bars[i];
    const prevClose = bars[i - 1].close;
    if (high == null || low == null) {
      out.push(NaN);
      continue;
    }
    out.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
    );
  }
  return out;
}

function wilderSmooth(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) {
    if (!Number.isFinite(values[i])) return out;
    sum += values[i];
  }
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i += 1) {
    const prev = out[i - 1];
    if (prev == null || !Number.isFinite(values[i])) {
      out[i] = null;
      continue;
    }
    out[i] = (prev * (period - 1) + values[i]) / period;
  }
  return out;
}

function computeAdx(bars: OhlcvBar[], period = 14): {
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
} {
  if (bars.length < period + 2) {
    return { adx: null, plusDi: null, minusDi: null };
  }
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const h = bars[i].high;
    const l = bars[i].low;
    const ph = bars[i - 1].high;
    const pl = bars[i - 1].low;
    const pc = bars[i - 1].close;
    if (h == null || l == null || ph == null || pl == null) {
      plusDM.push(0);
      minusDM.push(0);
      tr.push(NaN);
      continue;
    }
    const up = h - ph;
    const down = pl - l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = wilderSmooth(tr, period);
  const smPlus = wilderSmooth(plusDM, period);
  const smMinus = wilderSmooth(minusDM, period);
  const dx: number[] = [];
  for (let i = 0; i < atr.length; i += 1) {
    const a = atr[i];
    const p = smPlus[i];
    const m = smMinus[i];
    if (a == null || a === 0 || p == null || m == null) {
      dx.push(NaN);
      continue;
    }
    const plusDi = (p / a) * 100;
    const minusDi = (m / a) * 100;
    const sum = plusDi + minusDi;
    dx.push(sum === 0 ? 0 : (Math.abs(plusDi - minusDi) / sum) * 100);
  }
  const adxSeries = wilderSmooth(
    dx.map((v) => (Number.isFinite(v) ? v : 0)),
    period,
  );
  const last = atr.length - 1;
  const a = atr[last];
  const p = smPlus[last];
  const m = smMinus[last];
  if (a == null || a === 0 || p == null || m == null) {
    return { adx: null, plusDi: null, minusDi: null };
  }
  return {
    adx: adxSeries[last] ?? null,
    plusDi: (p / a) * 100,
    minusDi: (m / a) * 100,
  };
}

function computeAroon(bars: OhlcvBar[], period = 25): {
  up: number | null;
  down: number | null;
  osc: number | null;
} {
  if (bars.length < period + 1) return { up: null, down: null, osc: null };
  const window = bars.slice(-(period + 1));
  let highIdx = 0;
  let lowIdx = 0;
  let high = -Infinity;
  let low = Infinity;
  for (let i = 0; i < window.length; i += 1) {
    const h = window[i].high ?? window[i].close;
    const l = window[i].low ?? window[i].close;
    if (h >= high) {
      high = h;
      highIdx = i;
    }
    if (l <= low) {
      low = l;
      lowIdx = i;
    }
  }
  const up = ((period - (window.length - 1 - highIdx)) / period) * 100;
  const down = ((period - (window.length - 1 - lowIdx)) / period) * 100;
  return { up, down, osc: up - down };
}

function computeStochastic(
  bars: OhlcvBar[],
  kPeriod = 14,
  kSmooth = 3,
  dPeriod = 3,
): { k: number | null; d: number | null } {
  if (bars.length < kPeriod + kSmooth + dPeriod) {
    return { k: null, d: null };
  }
  const rawK: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i += 1) {
    const slice = bars.slice(i - kPeriod + 1, i + 1);
    const highs = slice.map((b) => b.high ?? b.close);
    const lows = slice.map((b) => b.low ?? b.close);
    const hh = Math.max(...highs);
    const ll = Math.min(...lows);
    const close = bars[i].close;
    rawK.push(hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100);
  }
  const kSeries: number[] = [];
  for (let i = kSmooth - 1; i < rawK.length; i += 1) {
    const avg =
      rawK.slice(i - kSmooth + 1, i + 1).reduce((a, b) => a + b, 0) / kSmooth;
    kSeries.push(avg);
  }
  if (kSeries.length < dPeriod) return { k: null, d: null };
  const k = kSeries[kSeries.length - 1];
  const d =
    kSeries.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  return { k, d };
}

function computeStochRsi(closes: number[], period = 14): number | null {
  const series = rsiSeries(closes, period);
  const vals = series.filter((v): v is number => v != null);
  if (vals.length < period) return null;
  const window = vals.slice(-period);
  const min = Math.min(...window);
  const max = Math.max(...window);
  const last = window[window.length - 1];
  if (max === min) return 50;
  return ((last - min) / (max - min)) * 100;
}

function williamsR(bars: OhlcvBar[], period = 14): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const highs = slice.map((b) => b.high ?? b.close);
  const lows = slice.map((b) => b.low ?? b.close);
  const hh = Math.max(...highs);
  const ll = Math.min(...lows);
  const close = bars[bars.length - 1].close;
  if (hh === ll) return -50;
  return ((hh - close) / (hh - ll)) * -100;
}

function cci(bars: OhlcvBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const typical = bars.map((b) => {
    const h = b.high ?? b.close;
    const l = b.low ?? b.close;
    return (h + l + b.close) / 3;
  });
  const window = typical.slice(-period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const meanDev =
    window.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
  if (meanDev === 0) return 0;
  return (typical[typical.length - 1] - mean) / (0.015 * meanDev);
}

function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: number | null; signal: number | null; hist: number | null } {
  if (closes.length < slow + signalPeriod) {
    return { line: null, signal: null, hist: null };
  }
  const fastE = emaSeries(closes, fast);
  const slowE = emaSeries(closes, slow);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (fastE[i] != null && slowE[i] != null) {
      macdLine.push((fastE[i] as number) - (slowE[i] as number));
    }
  }
  if (macdLine.length < signalPeriod) {
    return { line: null, signal: null, hist: null };
  }
  const signal = ema(macdLine, signalPeriod);
  const line = macdLine[macdLine.length - 1];
  if (signal == null) return { line, signal: null, hist: null };
  return { line, signal, hist: line - signal };
}

function roc(closes: number[], period = 12): number | null {
  if (closes.length <= period) return null;
  const prev = closes[closes.length - 1 - period];
  const last = closes[closes.length - 1];
  if (!prev) return null;
  return ((last - prev) / prev) * 100;
}

function bollinger(
  closes: number[],
  period = 20,
  mult = 2,
): { percentB: number | null; bandwidth: number | null } {
  if (closes.length < period) return { percentB: null, bandwidth: null };
  const window = closes.slice(-period);
  const mid = window.reduce((a, b) => a + b, 0) / period;
  const sd = stdev(window);
  if (sd == null || mid === 0) return { percentB: null, bandwidth: null };
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const last = closes[closes.length - 1];
  const width = upper - lower;
  return {
    percentB: width === 0 ? 0.5 : (last - lower) / width,
    bandwidth: (width / mid) * 100,
  };
}

function donchianPosition(bars: OhlcvBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hh = Math.max(...slice.map((b) => b.high ?? b.close));
  const ll = Math.min(...slice.map((b) => b.low ?? b.close));
  const close = bars[bars.length - 1].close;
  if (hh === ll) return 50;
  return ((close - ll) / (hh - ll)) * 100;
}

function relativeVolume(bars: OhlcvBar[], period = 20): number | null {
  const vols = bars
    .map((b) => b.volume)
    .filter((v): v is number => v != null && v > 0);
  if (vols.length < period) return null;
  const avg = vols.slice(-period).reduce((a, b) => a + b, 0) / period;
  const last = vols[vols.length - 1];
  return avg > 0 ? last / avg : null;
}

function mfi(bars: OhlcvBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  let pos = 0;
  let neg = 0;
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const prev = bars[i - 1];
    const cur = bars[i];
    const h = cur.high ?? cur.close;
    const l = cur.low ?? cur.close;
    const tp = (h + l + cur.close) / 3;
    const ptp =
      ((prev.high ?? prev.close) + (prev.low ?? prev.close) + prev.close) / 3;
    const vol = cur.volume ?? 0;
    const mf = tp * vol;
    if (tp > ptp) pos += mf;
    else if (tp < ptp) neg += mf;
  }
  if (neg === 0) return 100;
  const ratio = pos / neg;
  return 100 - 100 / (1 + ratio);
}

function chaikinMoneyFlow(bars: OhlcvBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  let mfv = 0;
  let volSum = 0;
  for (const b of slice) {
    const h = b.high ?? b.close;
    const l = b.low ?? b.close;
    const vol = b.volume ?? 0;
    const range = h - l;
    const clv = range === 0 ? 0 : ((b.close - l) - (h - b.close)) / range;
    mfv += clv * vol;
    volSum += vol;
  }
  if (volSum === 0) return null;
  return mfv / volSum;
}

function obvChange20(bars: OhlcvBar[]): number | null {
  if (bars.length < 21) return null;
  let obv = 0;
  const series: number[] = [0];
  for (let i = 1; i < bars.length; i += 1) {
    const vol = bars[i].volume ?? 0;
    if (bars[i].close > bars[i - 1].close) obv += vol;
    else if (bars[i].close < bars[i - 1].close) obv -= vol;
    series.push(obv);
  }
  const last = series[series.length - 1];
  const prior = series[series.length - 21];
  if (prior === 0) return last === 0 ? 0 : null;
  return ((last - prior) / Math.abs(prior)) * 100;
}

/**
 * Session VWAP from bars that share the same US calendar day as the last bar.
 * Requires volume; returns null when volume is missing.
 */
export function sessionVwapPct(bars: OhlcvBar[]): number | null {
  if (bars.length === 0) return null;
  const lastT = bars[bars.length - 1].t;
  // Approximate US session day via UTC date of the bar (Yahoo timestamps are
  // exchange-local epoch; grouping by calendar day of the timestamp is enough
  // for a session VWAP when bars are intraday).
  const dayKey = (t: number) => Math.floor(t / 86_400);
  const session = bars.filter((b) => dayKey(b.t) === dayKey(lastT));
  let pv = 0;
  let vol = 0;
  for (const b of session) {
    if (b.volume == null || b.volume <= 0) continue;
    const h = b.high ?? b.close;
    const l = b.low ?? b.close;
    const typical = (h + l + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
  }
  if (vol <= 0) return null;
  const vwap = pv / vol;
  const last = bars[bars.length - 1].close;
  return vwap > 0 ? (last / vwap - 1) * 100 : null;
}

/** Aggregate 1h bars into 4h bars (4×1h). */
export function resampleHourlyBars(
  bars: OhlcvBar[],
  hours: 2 | 4,
): OhlcvBar[] {
  if (bars.length === 0) return [];
  const out: OhlcvBar[] = [];
  for (let i = 0; i < bars.length; i += hours) {
    const chunk = bars.slice(i, i + hours);
    if (chunk.length < hours) continue;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const highs = chunk.map((b) => b.high).filter((v): v is number => v != null);
    const lows = chunk.map((b) => b.low).filter((v): v is number => v != null);
    const vols = chunk.map((b) => b.volume).filter((v): v is number => v != null);
    out.push({
      t: last.t,
      open: first.open ?? first.close,
      high: highs.length ? Math.max(...highs) : last.close,
      low: lows.length ? Math.min(...lows) : last.close,
      close: last.close,
      volume: vols.length ? vols.reduce((a, b) => a + b, 0) : null,
    });
  }
  return out;
}

export function resampleTo4h(bars: OhlcvBar[]): OhlcvBar[] {
  return resampleHourlyBars(bars, 4);
}

export function emptyTimeframedIndicators(asOf: string): TimeframedIndicatorsPayload {
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

/** Compute the full comprehensive-core library for one bar series. */
export function computeTimeframedIndicators(
  bars: OhlcvBar[],
  opts?: { includeVwap?: boolean; asOf?: string },
): TimeframedIndicatorsPayload {
  const asOf = opts?.asOf ?? new Date().toISOString();
  if (bars.length === 0) return emptyTimeframedIndicators(asOf);

  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema10 = ema(closes, 10);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const vsEmaPct = (emaValue: number | null): number | null =>
    last != null && emaValue != null && emaValue > 0
      ? (last / emaValue - 1) * 100
      : null;

  const stoch = computeStochastic(bars);
  const macdVals = macd(closes);
  const adxVals = computeAdx(bars);
  const aroon = computeAroon(bars);
  const bb = bollinger(closes);

  return {
    rsi: rsi(closes, 14),
    stochK: stoch.k,
    stochD: stoch.d,
    stochRsi: computeStochRsi(closes, 14),
    williamsR: williamsR(bars, 14),
    cci: cci(bars, 20),
    macdHistogram: macdVals.hist,
    macdLine: macdVals.line,
    macdSignal: macdVals.signal,
    roc: roc(closes, 12),
    priceAboveSma20:
      last != null && sma20 != null ? (last > sma20 ? 1 : 0) : null,
    priceAboveSma50:
      last != null && sma50 != null ? (last > sma50 ? 1 : 0) : null,
    priceAboveSma200:
      last != null && sma200 != null ? (last > sma200 ? 1 : 0) : null,
    priceVsEma10Pct: vsEmaPct(ema10),
    priceVsEma20Pct: vsEmaPct(ema20),
    priceVsEma50Pct: vsEmaPct(ema50),
    adx: adxVals.adx,
    plusDi: adxVals.plusDi,
    minusDi: adxVals.minusDi,
    aroonUp: aroon.up,
    aroonDown: aroon.down,
    aroonOsc: aroon.osc,
    atrPct: atrPct(bars, 14),
    bollingerPercentB: bb.percentB,
    bollingerBandwidth: bb.bandwidth,
    donchianPosition: donchianPosition(bars, 20),
    relativeVolume: relativeVolume(bars, 20),
    priceVsVwapPct: opts?.includeVwap ? sessionVwapPct(bars) : null,
    mfi: mfi(bars, 14),
    chaikinMoneyFlow: chaikinMoneyFlow(bars, 20),
    obvChange20: obvChange20(bars),
    asOf,
  };
}

/** Yahoo chart range/interval for each candle Time. 4h is resampled from 1h. */
export const TIMEFRAME_FETCH: Record<
  CandleTime,
  { range: string; interval: string; resampleHours?: 2 | 4 }
> = {
  "15m": { range: "60d", interval: "15m" },
  "30m": { range: "60d", interval: "30m" },
  "1h": { range: "1y", interval: "1h" },
  "2h": { range: "1y", interval: "1h", resampleHours: 2 },
  "4h": { range: "1y", interval: "1h", resampleHours: 4 },
  "1D": { range: "1y", interval: "1d" },
  "1W": { range: "5y", interval: "1wk" },
  "1M": { range: "max", interval: "1mo" },
};

export const INTRADAY_TIMES = new Set<CandleTime>([
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
]);

export function candleTtlMs(tf: CandleTime, marketOpen: boolean): number {
  if (!marketOpen) return 86_400_000;
  const map: Record<CandleTime, number> = {
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1D": 86_400_000,
    "1W": 86_400_000,
    "1M": 86_400_000,
  };
  return map[tf];
}
