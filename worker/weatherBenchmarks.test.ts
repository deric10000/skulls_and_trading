import { describe, expect, it } from "vitest";
import type { OhlcvBar } from "./indicators";
import {
  buildWeatherBenchmarkObservable,
  derivePublishedWeatherBenchmarks,
  deriveWeatherSymbolObservables,
  SECTOR_SPDR_SYMBOLS,
  WEATHER_BENCHMARK_SYMBOLS,
} from "./weatherBenchmarks";

function dailyBars(count = 220): OhlcvBar[] {
  return Array.from({ length: count }, (_, index) => ({
    t: 1_700_000_000 + index * 86_400,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1_000_000,
  }));
}

describe("weather benchmark projection", () => {
  it("keeps the approved system set outside any user manifest concern", () => {
    expect(WEATHER_BENCHMARK_SYMBOLS).toEqual([
      "RSP",
      "IWM",
      ...SECTOR_SPDR_SYMBOLS,
      "QQQ",
    ]);
    expect(WEATHER_BENCHMARK_SYMBOLS).not.toContain("SPY");
  });

  it("derives bounded observables from completed daily bars", () => {
    const value = buildWeatherBenchmarkObservable(dailyBars());
    expect(value).toMatchObject({
      price: 320,
    });
    expect(value?.ema200).toBeTypeOf("number");
    expect(value?.sma50).toBeTypeOf("number");
    expect(value?.atrPct).toBeGreaterThan(0);
    expect(value?.atrPctBaseline60d).toBeTypeOf("number");
    expect(value?.drawdownFrom20dHighPct).toBeTypeOf("number");
    expect(value?.return5dPct).toBeTypeOf("number");
    expect(value?.return20dPct).toBeTypeOf("number");
  });

  it("annotates non-SPY benchmarks with RS vs SPY at publish", () => {
    const spy = buildWeatherBenchmarkObservable(dailyBars())!;
    const sector = {
      ...spy,
      return5dPct: (spy.return5dPct ?? 0) + 1.5,
      return20dPct: (spy.return20dPct ?? 0) + 2.25,
    };
    const published = derivePublishedWeatherBenchmarks({
      SPY: spy,
      XLK: sector,
      RSP: spy,
      QQQ: spy,
      ...Object.fromEntries(
        SECTOR_SPDR_SYMBOLS.filter((symbol) => symbol !== "XLK").map(
          (symbol) => [symbol, spy],
        ),
      ),
    });
    expect(published.benchmarks.XLK?.rsVsSpy5d).toBeCloseTo(1.5);
    expect(published.benchmarks.XLK?.rsVsSpy20d).toBeCloseTo(2.25);
    expect(published.benchmarks.SPY?.rsVsSpy5d).toBeUndefined();
  });

  it("marks an IWM-only cut provisional while retaining participation", () => {
    const benchmark = buildWeatherBenchmarkObservable(dailyBars())!;
    const values = Object.fromEntries(
      ["SPY", "RSP", "QQQ", ...SECTOR_SPDR_SYMBOLS].map((symbol) => [
        symbol,
        benchmark,
      ]),
    );
    const published = derivePublishedWeatherBenchmarks(values);
    expect(published.status).toBe("provisional");
    expect(published.missingSymbols).toEqual(["IWM"]);
    expect(published.iwmMinusSpy5dPct).toBeUndefined();
    expect(published.sectorSpdrOutperformingFreshCount).toBe(11);
    expect(published.sectorSpdrAboveSma50FreshCount).toBe(11);
  });

  it("is insufficient without RSP or six fresh sector observations", () => {
    const benchmark = buildWeatherBenchmarkObservable(dailyBars())!;
    const published = derivePublishedWeatherBenchmarks({
      SPY: benchmark,
      QQQ: benchmark,
      XLE: benchmark,
      XLB: benchmark,
      XLI: benchmark,
      XLY: benchmark,
      XLP: benchmark,
    });
    expect(published.status).toBe("insufficient");
    expect(published.sectorSpdrOutperforming).toBeUndefined();
  });
});

describe("registered-symbol weather projection", () => {
  it("derives RS vs SPY and mapped sector SPDR when present", () => {
    const benchmarks = derivePublishedWeatherBenchmarks({
      SPY: { asOf: "2026-07-29", price: 600, return5dPct: 2, return20dPct: 5 },
      XLK: { asOf: "2026-07-29", price: 220, return5dPct: 3, return20dPct: 7 },
    });
    expect(deriveWeatherSymbolObservables(
      {
        AAPL: {
          asOf: "2026-07-29", price: 210,
          return5dPct: 4, return20dPct: 9,
        },
      },
      { AAPL: { providerSector: "Technology" } },
      benchmarks,
    ).AAPL).toMatchObject({
      rsVsSpy5d: 2,
      rsVsSpy20d: 4,
      rsVsSector5d: 1,
      rsVsSector20d: 2,
    });
  });
});
