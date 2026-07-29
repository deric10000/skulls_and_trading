import { describe, expect, it } from "vitest";
import { DEFAULT_STRATEGIES } from "../../data";
import type { Portfolio, PortfolioHolding, Strategy } from "../../types";
import { isUntrackedHolding, strategiesForHolding, untrackedHoldings } from "./tickerStrategy";
import { canonicalStrategyIds } from "./convictionRunState";

const DEFAULT_ID = DEFAULT_STRATEGIES[0]!.id;

const holding = (
  ticker: string,
  strategyIds: string[] = [],
  shares = 1,
): PortfolioHolding => ({
  ticker,
  shares,
  avgPrice: 10,
  openPnlPct: 0,
  conviction: 0,
  status: "Watch",
  reason: "",
  strategyIds,
});

const strategy = (
  id: string,
  appliedPortfolioIds: string[],
  isDefault = true,
): Strategy =>
  ({
    id,
    name: id,
    isDefault,
    enabled: true,
    appliedPortfolioIds,
    tickerExclusions: {},
  }) as Strategy;

describe("untracked holdings", () => {
  it("requires an enabled strategy assignment in the holding's own source", () => {
    const tracked = holding("AAA", [DEFAULT_ID]);
    const notAssigned = holding("BBB");
    const strategies = [strategy(DEFAULT_ID, ["book"])];

    expect(isUntrackedHolding(tracked, "book", strategies)).toBe(false);
    expect(isUntrackedHolding(notAssigned, "book", strategies)).toBe(true);
    expect(isUntrackedHolding(tracked, "elsewhere", strategies)).toBe(true);
  });

  it("honors custom-strategy exclusions", () => {
    const custom = {
      ...strategy("custom", ["book"], false),
      tickerExclusions: { book: ["BBB"] },
    };

    expect(isUntrackedHolding(holding("AAA"), "book", [custom])).toBe(false);
    expect(isUntrackedHolding(holding("BBB"), "book", [custom])).toBe(true);
  });

  it("includes zero-share watchlist names and preserves source order", () => {
    const portfolio: Portfolio = {
      id: "watch",
      label: "Watch",
      type: "watchlist",
      holdings: [
        holding("ZERO", [], 0),
        holding("TRACKED", [DEFAULT_ID], 0),
        holding("HELD"),
      ],
    };

    expect(
      untrackedHoldings(portfolio, [strategy(DEFAULT_ID, ["watch"])]).map(
        (item) => item.ticker,
      ),
    ).toEqual(["ZERO", "HELD"]);
  });

  it("returns applicable strategies sorted by id regardless of workspace order", () => {
    const held = holding("AAA", ["z-strat", "a-strat"]);
    const strategies = [
      strategy("z-strat", ["book"], false),
      strategy("a-strat", ["book"], false),
    ];
    const forward = strategiesForHolding(held, "book", strategies).map(
      (item) => item.id,
    );
    const reverse = strategiesForHolding(held, "book", [...strategies].reverse())
      .map((item) => item.id);
    expect(forward).toEqual(["a-strat", "z-strat"]);
    expect(reverse).toEqual(["a-strat", "z-strat"]);
    expect(canonicalStrategyIds(forward)).toEqual(canonicalStrategyIds(reverse));
  });
});
