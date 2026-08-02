import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isMarketPullOpen as spaOpen,
  nextMarketPullAt as spaNext,
} from "../src/lib/market/marketPullWindow";
import {
  isMarketPullOpen as workerOpen,
  nextMarketPullAt as workerNext,
} from "../worker/marketPullWindow";

/** Strip the only intentional path difference in the twin sync comments. */
function normalizeTwinSource(source: string): string {
  return source
    .replace(
      "Keep in sync with worker/marketPullWindow.ts.",
      "Keep in sync with <twin>.",
    )
    .replace(
      "Keep in sync with src/lib/market/marketPullWindow.ts.",
      "Keep in sync with <twin>.",
    );
}

describe("marketPullWindow SPA/Worker parity", () => {
  it("keeps twin source files identical aside from the sync comment path", () => {
    const spa = readFileSync(
      new URL("../src/lib/market/marketPullWindow.ts", import.meta.url),
      "utf8",
    );
    const worker = readFileSync(
      new URL("../worker/marketPullWindow.ts", import.meta.url),
      "utf8",
    );
    expect(normalizeTwinSource(spa)).toBe(normalizeTwinSource(worker));
  });

  it("matches open/next behavior across weekend and weekday samples", () => {
    const samples = [
      Date.parse("2026-07-31T13:20:00.000Z"), // Fri open
      Date.parse("2026-08-01T00:00:00.000Z"), // Fri 20:00 ET edge
      Date.parse("2026-08-01T00:30:00.000Z"), // Fri after close
      Date.parse("2026-08-01T16:00:00.000Z"), // Sat
      Date.parse("2026-08-02T16:58:00.000Z"), // Sun afternoon
      Date.parse("2026-08-03T00:00:00.000Z"), // Sun overnight open
      Date.parse("2026-08-03T14:20:00.000Z"), // Mon open
    ];
    for (const ms of samples) {
      expect(spaOpen(ms)).toBe(workerOpen(ms));
      expect(spaNext(ms)).toBe(workerNext(ms));
    }
  });
});
