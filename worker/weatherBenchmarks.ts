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
  /** Cycle that fetched or carried this observable into the published payload. */
  sourceCycleAsOf?: string;
  freshness?: "fresh" | "stale";
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
  /** Prior fresh cycle RS20, retained only for deterministic Rotation evidence. */
  priorFreshRsVsSpy20d?: number;
  dailyRangeMultiple?: number;
  absoluteReturnAtrMultiple?: number;
  volumeRatio?: number;
  breakingResistance?: boolean;
  lostSupport?: boolean;
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
  cycleAsOf?: string,
  prior: Record<string, WeatherSymbolObservable> = {},
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
      ...(cycleAsOf ? { sourceCycleAsOf: cycleAsOf } : {}),
      freshness: "fresh",
      ...(finite(observable.return5dPct) && finite(spy?.return5dPct)
        ? { rsVsSpy5d: observable.return5dPct - spy.return5dPct }
        : {}),
      ...(finite(observable.return20dPct) && finite(spy?.return20dPct)
        ? { rsVsSpy20d: observable.return20dPct - spy.return20dPct }
        : {}),
      ...(prior[symbol]?.freshness === "fresh" &&
      finite(prior[symbol]?.rsVsSpy20d)
        ? { priorFreshRsVsSpy20d: prior[symbol]!.rsVsSpy20d }
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
  const previous = dailyBars.at(-2);
  const atrPercent = atrPct(dailyBars, 14);
  const atrPrice =
    finite(atrPercent) && atrPercent > 0
      ? (last.close * atrPercent) / 100
      : undefined;
  const priorBars = dailyBars.slice(0, -1);
  const prior20High =
    priorBars.length >= 20
      ? Math.max(
          ...priorBars
            .slice(-20)
            .map((bar) => bar.high)
            .filter(finite),
        )
      : undefined;
  const priorVolumes = priorBars
    .slice(-20)
    .map((bar) => bar.volume)
    .filter(finite);
  const averagePriorVolume =
    priorVolumes.length > 0
      ? priorVolumes.reduce((sum, value) => sum + value, 0) /
        priorVolumes.length
      : undefined;
  const priorCloses = closes.slice(0, -1);
  const lostSupport = [
    [ema(priorCloses, 20), ema(closes, 20)],
    [sma(priorCloses, 50), sma(closes, 50)],
    [sma(priorCloses, 200), sma(closes, 200)],
  ].some(
    ([priorLevel, currentLevel]) =>
      finite(previous?.close) &&
      finite(priorLevel) &&
      finite(currentLevel) &&
      previous.close >= priorLevel &&
      last.close < currentLevel,
  );
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
    ...optional("atrPct", atrPercent),
    ...optional("atrPctBaseline60d", atrPctBaseline60d(dailyBars)),
    ...optional("drawdownFrom20dHighPct", drawdownFrom20dHighPct(dailyBars)),
    ...optional("rsi14", rsi(closes, 14)),
    ...optional("return5dPct", returnPct(closes, 5)),
    ...optional("return20dPct", returnPct(closes, 20)),
    ...optional(
      "dailyRangeMultiple",
      finite(last.high) &&
        finite(last.low) &&
        finite(atrPrice) &&
        atrPrice > 0
        ? (last.high - last.low) / atrPrice
        : undefined,
    ),
    ...optional(
      "absoluteReturnAtrMultiple",
      finite(previous?.close) && finite(atrPrice) && atrPrice > 0
        ? Math.abs(last.close - previous.close) / atrPrice
        : undefined,
    ),
    ...optional(
      "volumeRatio",
      finite(last.volume) && finite(averagePriorVolume) && averagePriorVolume > 0
        ? last.volume / averagePriorVolume
        : undefined,
    ),
    ...(finite(prior20High) && finite(atrPrice)
      ? { breakingResistance: last.close >= prior20High + 0.25 * atrPrice }
      : {}),
    ...(priorBars.length > 0 ? { lostSupport } : {}),
  };
}

export interface PublishedWeatherBenchmarks {
  status: "complete" | "provisional" | "insufficient";
  completedAt?: string;
  expectedSymbols: string[];
  freshSymbols: string[];
  staleSymbols?: string[];
  missingSymbols: string[];
  freshnessBySymbol?: Record<string, "fresh" | "stale" | "unavailable">;
  sourceCycleAsOfBySymbol?: Record<string, string>;
  benchmarks: Record<string, WeatherBenchmarkObservable>;
  rspMinusSpy5dPct?: number;
  iwmMinusSpy5dPct?: number;
  sectorSpdrOutperforming?: number;
  sectorSpdrOutperformingFreshCount: number;
  sectorSpdrAboveSma50?: number;
  sectorSpdrAboveSma50FreshCount: number;
}

const HOUR_MS = 60 * 60_000;
export const WEATHER_BENCHMARK_YAHOO_RESERVE = 2;

function easternCycleParts(time: number): {
  weekday: string;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(time));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/** Same Sunday 20:00 ET → Friday 20:00 ET market-week policy as marketCycle. */
export function isExpectedWeatherCycle(time: number): boolean {
  const { weekday, minutes } = easternCycleParts(time);
  if (weekday === "Sat") return false;
  if (weekday === "Sun") return minutes >= 20 * 60;
  if (weekday === "Fri") return minutes <= 20 * 60;
  return true;
}

/** Count scheduled hourly cycles, excluding the source cycle itself. */
export function expectedWeatherCycleAge(
  sourceCycleAsOf: string | undefined,
  currentCycleAsOf: string | undefined,
): number | null {
  if (!sourceCycleAsOf || !currentCycleAsOf) return null;
  const source = Date.parse(sourceCycleAsOf);
  const current = Date.parse(currentCycleAsOf);
  if (!Number.isFinite(source) || !Number.isFinite(current) || source > current) {
    return null;
  }
  let age = 0;
  for (
    let boundary = Math.floor(source / HOUR_MS) * HOUR_MS + HOUR_MS;
    boundary <= current && age <= 3;
    boundary += HOUR_MS
  ) {
    if (isExpectedWeatherCycle(boundary)) age += 1;
  }
  return age;
}

/**
 * Reserve Yahoo headroom and drop IWM before any required benchmark. Existing
 * values are excluded so minute-59 recovery fetches only missing symbols.
 */
export function planWeatherBenchmarkFetch(
  yahooRemaining: number,
  existingSymbols: Iterable<string> = [],
  reserve = WEATHER_BENCHMARK_YAHOO_RESERVE,
): { fetchSymbols: string[]; budgetSkippedSymbols: string[] } {
  const existing = new Set(
    [...existingSymbols].map((symbol) => symbol.toUpperCase()),
  );
  const missingRequired = WEATHER_BENCHMARK_FETCH_ORDER.filter(
    (symbol) => symbol !== "IWM" && !existing.has(symbol),
  );
  const iwmMissing = !existing.has("IWM");
  const available = Math.max(0, Math.floor(yahooRemaining) - reserve);
  const orderedMissing = [
    ...missingRequired,
    ...(iwmMissing ? ["IWM"] : []),
  ];
  const fetchSymbols = orderedMissing.slice(0, available);
  return {
    fetchSymbols,
    budgetSkippedSymbols: orderedMissing.slice(fetchSymbols.length),
  };
}

export function weatherBenchmarkMissingSymbols(
  values: Record<string, WeatherBenchmarkObservable>,
): string[] {
  return WEATHER_BENCHMARK_FETCH_ORDER.filter((symbol) => !values[symbol]);
}

export function derivePublishedWeatherBenchmarks(
  values: Record<string, WeatherBenchmarkObservable>,
  completedAt?: string,
  lifecycle: {
    cycleAsOf?: string;
    prior?: PublishedWeatherBenchmarks | null;
  } = {},
): PublishedWeatherBenchmarks {
  const expectedSymbols = ["SPY", ...WEATHER_BENCHMARK_SYMBOLS];
  const benchmarks: Record<string, WeatherBenchmarkObservable> = {};
  const freshnessBySymbol: Record<
    string,
    "fresh" | "stale" | "unavailable"
  > = {};
  const sourceCycleAsOfBySymbol: Record<string, string> = {};
  for (const symbol of expectedSymbols) {
    const current = values[symbol];
    if (current) {
      const sourceCycleAsOf = lifecycle.cycleAsOf ?? current.sourceCycleAsOf;
      benchmarks[symbol] = {
        ...current,
        ...(sourceCycleAsOf ? { sourceCycleAsOf } : {}),
        freshness: "fresh",
        ...(lifecycle.prior?.freshnessBySymbol?.[symbol] === "fresh" &&
        finite(lifecycle.prior?.benchmarks[symbol]?.rsVsSpy20d)
          ? {
              priorFreshRsVsSpy20d:
                lifecycle.prior!.benchmarks[symbol]!.rsVsSpy20d,
            }
          : {}),
      };
      freshnessBySymbol[symbol] = "fresh";
      if (sourceCycleAsOf) sourceCycleAsOfBySymbol[symbol] = sourceCycleAsOf;
      continue;
    }
    const prior = lifecycle.prior?.benchmarks[symbol];
    const priorSource =
      lifecycle.prior?.sourceCycleAsOfBySymbol?.[symbol] ??
      prior?.sourceCycleAsOf;
    const age = expectedWeatherCycleAge(priorSource, lifecycle.cycleAsOf);
    if (prior && age != null && age >= 1 && age <= 2) {
      benchmarks[symbol] = {
        ...prior,
        ...(priorSource ? { sourceCycleAsOf: priorSource } : {}),
        freshness: "stale",
      };
      freshnessBySymbol[symbol] = "stale";
      if (priorSource) sourceCycleAsOfBySymbol[symbol] = priorSource;
    } else {
      freshnessBySymbol[symbol] = "unavailable";
    }
  }
  const freshSymbols = expectedSymbols.filter(
    (symbol) => freshnessBySymbol[symbol] === "fresh",
  );
  const staleSymbols = expectedSymbols.filter(
    (symbol) => freshnessBySymbol[symbol] === "stale",
  );
  const missingSymbols = expectedSymbols.filter(
    (symbol) => freshnessBySymbol[symbol] === "unavailable",
  );
  const fresh = (symbol: string) =>
    freshnessBySymbol[symbol] === "fresh" ? benchmarks[symbol] : undefined;
  const spy5d = fresh("SPY")?.return5dPct;
  const relativeSectors = SECTOR_SPDR_SYMBOLS.filter(
    (symbol) =>
      finite(fresh(symbol)?.return5dPct) && finite(spy5d),
  );
  const structuredSectors = SECTOR_SPDR_SYMBOLS.filter(
    (symbol) => finite(fresh(symbol)?.sma50),
  );
  const outperforming = relativeSectors.filter(
    (symbol) => fresh(symbol)!.return5dPct! > spy5d!,
  ).length;
  const aboveSma50 = structuredSectors.filter(
    (symbol) => fresh(symbol)!.price > fresh(symbol)!.sma50!,
  ).length;
  const hasRspParticipation =
    finite(fresh("RSP")?.return5dPct) && finite(spy5d);
  const hasMinimumParticipation =
    hasRspParticipation || relativeSectors.length >= 6 ||
    structuredSectors.length >= 6;
  const hasSpyStructure =
    finite(fresh("SPY")?.price) &&
    finite(fresh("SPY")?.atrPct) &&
    (
      finite(fresh("SPY")?.ema20) ||
      finite(fresh("SPY")?.sma20) ||
      finite(fresh("SPY")?.sma50)
    );
  const hasMinimumMarket =
    hasSpyStructure && hasMinimumParticipation;
  const hasPreferredFields =
    expectedSymbols.every((symbol) => freshnessBySymbol[symbol] === "fresh") &&
    hasRspParticipation &&
    finite(fresh("IWM")?.return5dPct) &&
    relativeSectors.length === SECTOR_SPDR_SYMBOLS.length &&
    structuredSectors.length === SECTOR_SPDR_SYMBOLS.length &&
    finite(fresh("QQQ")?.price) &&
    finite(fresh("QQQ")?.ema200) &&
    finite(fresh("QQQ")?.atrPct);
  const status =
    !hasMinimumMarket
      ? "insufficient"
      : !hasPreferredFields
        ? "provisional"
        : "complete";
  const spy5dVal = benchmarks.SPY?.return5dPct;
  const spy20dVal = benchmarks.SPY?.return20dPct;
  for (const [symbol, obs] of Object.entries(benchmarks)) {
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
  return {
    status,
    ...(completedAt ? { completedAt } : {}),
    expectedSymbols,
    freshSymbols,
    staleSymbols,
    missingSymbols,
    freshnessBySymbol,
    sourceCycleAsOfBySymbol,
    benchmarks,
    ...(finite(fresh("RSP")?.return5dPct) && finite(spy5d)
      ? { rspMinusSpy5dPct: fresh("RSP")!.return5dPct! - spy5d }
      : {}),
    ...(finite(fresh("IWM")?.return5dPct) && finite(spy5d)
      ? { iwmMinusSpy5dPct: fresh("IWM")!.return5dPct! - spy5d }
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
