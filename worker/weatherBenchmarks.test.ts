import { describe, expect, it } from "vitest";
import type { OhlcvBar } from "./indicators";
import {
  buildWeatherBenchmarkObservable,
  derivePublishedWeatherBenchmarks,
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
    expect(value?.return5dPct).toBeTypeOf("number");
    expect(value?.return20dPct).toBeTypeOf("number");
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
