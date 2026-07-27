import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Portfolio, Strategy } from "../../types";
import {
  marketBootFingerprint,
  resetMarketBootGate,
  runMarketBootSingleFlight,
} from "./boot";

describe("market boot gate", () => {
  beforeEach(resetMarketBootGate);

  it("fingerprints holdings and applied strategy scope independent of order", () => {
    const portfolio = {
      id: "book",
      holdings: [{ ticker: "aapl" }, { ticker: "MSFT" }],
    } as Portfolio;
    const strategy = {
      id: "strategy",
      appliedPortfolioIds: ["book"],
    } as Strategy;

    expect(marketBootFingerprint([portfolio], [strategy])).toBe(
      marketBootFingerprint(
        [{ ...portfolio, holdings: [...portfolio.holdings].reverse() }],
        [strategy],
      ),
    );
  });

  it("shares concurrent work and skips a completed fingerprint", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(() => pending);

    const first = runMarketBootSingleFlight("same", run);
    const second = runMarketBootSingleFlight("same", run);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    await runMarketBootSingleFlight("same", run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

