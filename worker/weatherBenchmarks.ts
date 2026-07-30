import { atrPct, ema, rsi, sma, type OhlcvBar } from "./indicators";

export const SECTOR_SPDR_SYMBOLS = [
  "XLE",
  "XLB",
  "XLI",
  "XLY",
  "XLP",
  "XLV",
  "XLF",
  "XLK",
  "XLC",
  "XLU",
  "XLRE",
] as const;

/** Must stay 1:1 with src/lib/weather/sectorSpdr.ts GICS_SECTOR_TO_SPDR. */
export const GICS_SECTOR_TO_SPDR = {
  Energy: "XLE",
  Materials: "XLB",
  Industrials: "XLI",
  "Consumer Discretionary": "XLY",
  "Consumer Staples": "XLP",
  "Health Care": "XLV",
  Financials: "XLF",
  "Information Technology": "XLK",
  "Communication Services": "XLC",
  Utilities: "XLU",
  "Real Estate": "XLRE",
} as const;

/** Dedicated system symbols. These never enter the user cycle manifest. */
export const WEATHER_BENCHMARK_SYMBOLS = [
  "RSP",
  "IWM",
  ...SECTOR_SPDR_SYMBOLS,
  "QQQ",
] as const;

/** Fetch priority protects QQQ/RSP and makes IWM the first budget cut. */
export const WEATHER_BENCHMARK_FETCH_ORDER = [
  "SPY",
  "QQQ",
  "RSP",
  ...SECTOR_SPDR_SYMBOLS,
  "IWM",
] as const;

export interface WeatherBenchmarkObservable {
  asOf: string;
  price: number;
  ema10?: number;
  ema20?: number;
  ema200?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  atrPct?: number;
  /** Median ATR14% over prior ≤60 completed sessions (instrument Risk). */
  atrPctBaseline60d?: number;
  /** Positive % below the prior completed 20-session high. */
  drawdownFrom20dHighPct?: number;
  rsi14?: number;
  return5dPct?: number;
  return20dPct?: number;
  /** Subject 5d − SPY 5d (percentage points); filled at publish. */
  rsVsSpy5d?: number;
  rsVsSpy20d?: number;
}

export interface WeatherSymbolObservable extends WeatherBenchmarkObservable {
  rsVsSector5d?: number;
  rsVsSector20d?: number;
}

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const YAHOO_SECTOR_TO_GICS: Record<string, keyof typeof GICS_SECTOR_TO_SPDR> = {
  "basic materials": "Materials",
  "communication services": "Communication Services",
  "consumer cyclical": "Consumer Discretionary",
  "consumer defensive": "Consumer Staples",
  energy: "Energy",
  "financial services": "Financials",
  financial: "Financials",
  financials: "Financials",
  healthcare: "Health Care",
  "health care": "Health Care",
  industrials: "Industrials",
  "real estate": "Real Estate",
  technology: "Information Technology",
  "information technology": "Information Technology",
  utilities: "Utilities",
  materials: "Materials",
  "consumer discretionary": "Consumer Discretionary",
  "consumer staples": "Consumer Staples",
};

function mappedSectorSpdr(providerSector: unknown): string | undefined {
  if (typeof providerSector !== "string") return undefined;
  const normalized = providerSector.trim().toLowerCase();
  const gics = YAHOO_SECTOR_TO_GICS[normalized];
  return gics ? GICS_SECTOR_TO_SPDR[gics] : undefined;
}

/** Publish-only RS enrichment; missing SPY/sector observations stay omitted. */
export function deriveWeatherSymbolObservables(
  values: Record<string, WeatherBenchmarkObservable>,
  fundamentals: Record<string, Record<string, unknown>>,
  benchmarks: PublishedWeatherBenchmarks,
): Record<string, WeatherSymbolObservable> {
  const output: Record<string, WeatherSymbolObservable> = {};
  const spy = benchmarks.benchmarks.SPY;
  for (const [symbol, observable] of Object.entries(values)) {
    const sectorSpdr = mappedSectorSpdr(fundamentals[symbol]?.providerSector);
    const sector = sectorSpdr
      ? benchmarks.benchmarks[sectorSpdr]
      : undefined;
    output[symbol] = {
      ...observable,
      ...(finite(observable.return5dPct) && finite(spy?.return5dPct)
        ? { rsVsSpy5d: observable.return5dPct - spy.return5dPct }
        : {}),
      ...(finite(observable.return20dPct) && finite(spy?.return20dPct)
        ? { rsVsSpy20d: observable.return20dPct - spy.return20dPct }
        : {}),
      ...(finite(observable.return5dPct) && finite(sector?.return5dPct)
        ? { rsVsSector5d: observable.return5dPct - sector.return5dPct }
        : {}),
      ...(finite(observable.return20dPct) && finite(sector?.return20dPct)
        ? { rsVsSector20d: observable.return20dPct - sector.return20dPct }
        : {}),
    };
  }
  return output;
}

function returnPct(closes: number[], sessions: number): number | undefined {
  if (closes.length <= sessions) return undefined;
  const current = closes.at(-1);
  const prior = closes.at(-(sessions + 1));
  if (!finite(current) || !finite(prior) || prior === 0) return undefined;
  return ((current - prior) / prior) * 100;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid];
}

/** Median of ATR14% ending on each of the last ≤60 completed sessions. */
function atrPctBaseline60d(bars: OhlcvBar[]): number | undefined {
  const values: number[] = [];
  for (let end = bars.length; end >= 15 && values.length < 60; end -= 1) {
    const value = atrPct(bars.slice(0, end), 14);
    if (finite(value)) values.push(value);
  }
  return median(values);
}

function drawdownFrom20dHighPct(bars: OhlcvBar[]): number | undefined {
  if (bars.length < 20) return undefined;
  const window = bars.slice(-20);
  const high = Math.max(
    ...window.map((bar) =>
      finite(bar.high) ? bar.high : finite(bar.close) ? bar.close : Number.NaN,
    ),
  );
  const close = bars.at(-1)?.close;
  if (!finite(high) || high <= 0 || !finite(close)) return undefined;
  return Math.max(0, ((high - close) / high) * 100);
}

/** Pure projection from the same completed daily bars used by cron technicals. */
export function buildWeatherBenchmarkObservable(
  dailyBars: OhlcvBar[],
): WeatherBenchmarkObservable | null {
  const last = dailyBars.at(-1);
  if (!last || !finite(last.close) || last.close <= 0) return null;
  const closes = dailyBars.map((bar) => bar.close);
  const optional = (key: string, value: number | null | undefined) =>
    finite(value) ? { [key]: value } : {};
  return {
    asOf: new Date(last.t * 1000).toISOString(),
    price: last.close,
    ...optional("ema10", ema(closes, 10)),
    ...optional("ema20", ema(closes, 20)),
    ...optional("ema200", ema(closes, 200)),
    ...optional("sma20", sma(closes, 20)),
    ...optional("sma50", sma(closes, 50)),
    ...optional("sma200", sma(closes, 200)),
    ...optional("atrPct", atrPct(dailyBars, 14)),
    ...optional("atrPctBaseline60d", atrPctBaseline60d(dailyBars)),
    ...optional("drawdownFrom20dHighPct", drawdownFrom20dHighPct(dailyBars)),
    ...optional("rsi14", rsi(closes, 14)),
    ...optional("return5dPct", returnPct(closes, 5)),
    ...optional("return20dPct", returnPct(closes, 20)),
  };
}

export interface PublishedWeatherBenchmarks {
  status: "complete" | "provisional" | "insufficient";
  completedAt?: string;
  expectedSymbols: string[];
  freshSymbols: string[];
  missingSymbols: string[];
  benchmarks: Record<string, WeatherBenchmarkObservable>;
  rspMinusSpy5dPct?: number;
  iwmMinusSpy5dPct?: number;
  sectorSpdrOutperforming?: number;
  sectorSpdrOutperformingFreshCount: number;
  sectorSpdrAboveSma50?: number;
  sectorSpdrAboveSma50FreshCount: number;
}

export function derivePublishedWeatherBenchmarks(
  values: Record<string, WeatherBenchmarkObservable>,
  completedAt?: string,
): PublishedWeatherBenchmarks {
  const expectedSymbols = ["SPY", ...WEATHER_BENCHMARK_SYMBOLS];
  const freshSymbols = expectedSymbols.filter((symbol) => values[symbol]);
  const missingSymbols = expectedSymbols.filter((symbol) => !values[symbol]);
  const spy5d = values.SPY?.return5dPct;
  const relativeSectors = SECTOR_SPDR_SYMBOLS.filter(
    (symbol) =>
      finite(values[symbol]?.return5dPct) && finite(spy5d),
  );
  const structuredSectors = SECTOR_SPDR_SYMBOLS.filter(
    (symbol) => finite(values[symbol]?.sma50),
  );
  const outperforming = relativeSectors.filter(
    (symbol) => values[symbol]!.return5dPct! > spy5d!,
  ).length;
  const aboveSma50 = structuredSectors.filter(
    (symbol) => values[symbol]!.price > values[symbol]!.sma50!,
  ).length;
  const hasRspParticipation =
    finite(values.RSP?.return5dPct) && finite(spy5d);
  const hasMinimumParticipation =
    hasRspParticipation || relativeSectors.length >= 6 ||
    structuredSectors.length >= 6;
  const hasSpyStructure =
    finite(values.SPY?.price) &&
    finite(values.SPY?.atrPct) &&
    (
      finite(values.SPY?.ema20) ||
      finite(values.SPY?.sma20) ||
      finite(values.SPY?.sma50)
    );
  const hasMinimumMarket =
    hasSpyStructure && hasMinimumParticipation;
  const hasPreferredFields =
    expectedSymbols.every((symbol) => values[symbol]) &&
    hasRspParticipation &&
    finite(values.IWM?.return5dPct) &&
    relativeSectors.length === SECTOR_SPDR_SYMBOLS.length &&
    structuredSectors.length === SECTOR_SPDR_SYMBOLS.length &&
    finite(values.QQQ?.price) &&
    finite(values.QQQ?.ema200) &&
    finite(values.QQQ?.atrPct);
  const status =
    !hasMinimumMarket
      ? "insufficient"
      : !hasPreferredFields
        ? "provisional"
        : "complete";
  const spy5dVal = values.SPY?.return5dPct;
  const spy20dVal = values.SPY?.return20dPct;
  const benchmarks: Record<string, WeatherBenchmarkObservable> = {};
  for (const [symbol, obs] of Object.entries(values)) {
    if (symbol === "SPY") {
      benchmarks[symbol] = obs;
      continue;
    }
    const withRs = { ...obs };
    if (finite(obs.return5dPct) && finite(spy5dVal)) {
      withRs.rsVsSpy5d = obs.return5dPct - spy5dVal;
    }
    if (finite(obs.return20dPct) && finite(spy20dVal)) {
      withRs.rsVsSpy20d = obs.return20dPct - spy20dVal;
    }
    benchmarks[symbol] = withRs;
  }
  if (values.SPY) benchmarks.SPY = values.SPY;
  return {
    status,
    ...(completedAt ? { completedAt } : {}),
    expectedSymbols,
    freshSymbols,
    missingSymbols,
    benchmarks,
    ...(finite(values.RSP?.return5dPct) && finite(spy5d)
      ? { rspMinusSpy5dPct: values.RSP.return5dPct - spy5d }
      : {}),
    ...(finite(values.IWM?.return5dPct) && finite(spy5d)
      ? { iwmMinusSpy5dPct: values.IWM.return5dPct - spy5d }
      : {}),
    ...(relativeSectors.length >= 6
      ? { sectorSpdrOutperforming: outperforming / relativeSectors.length }
      : {}),
    sectorSpdrOutperformingFreshCount: relativeSectors.length,
    ...(structuredSectors.length >= 6
      ? { sectorSpdrAboveSma50: aboveSma50 / structuredSectors.length }
      : {}),
    sectorSpdrAboveSma50FreshCount: structuredSectors.length,
  };
}
