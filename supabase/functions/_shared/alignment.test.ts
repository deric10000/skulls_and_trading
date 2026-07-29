import { describe, expect, it } from "vitest";
import { DEFAULT_BUCKETS, DEFAULT_STRATEGIES } from "../../../src/data";
import { portfolioWeightPct } from "../../../src/lib/finance/portfolioWeight";
import { scoreStock } from "../../../src/lib/forge/scoring";
import { computeStrategyScopeAlignment } from "../../../src/lib/forge/strategyAlignmentAdapter";
import { mergeStrategiesForScoring } from "../../../src/lib/forge/mergeStrategies";
import type { Portfolio, Strategy } from "../../../src/types";
import {
  requiredTickersForStrategyCheck,
  scoreAuthoritativeCheck,
  scoreStrategyCheck,
  type CompleteMarketCycle,
  type Workspace,
} from "./alignment";

const baseStrategy = DEFAULT_STRATEGIES.find(
  (strategy) => strategy.id === "value-growth-dividend",
)!;
const newerHoldingChip = {
  ...baseStrategy.rules.find((chip) => chip.id === "vgd-h1")!,
  operator: "<" as const,
  value: 90,
  weightPct: 100,
};
const strategy: Strategy = {
  ...baseStrategy,
  appliedPortfolioIds: ["deric", "second", "watch"],
  rules: [newerHoldingChip],
  ruleTags: [],
};

function holding(ticker: string, shares: number, avgPrice: number) {
  return {
    ticker,
    shares,
    avgPrice,
    openPnlPct: 0,
    conviction: 0,
    status: "Watch" as const,
    reason: "",
    strategyIds: [strategy.id],
  };
}

const portfolios: Portfolio[] = [
  {
    id: "deric",
    label: "Seeded",
    type: "portfolio",
    holdings: [
      holding("SOFI", 67, 15),
      holding("CUSTOM", 5, 40),
    ],
  },
  {
    id: "second",
    label: "Second",
    type: "portfolio",
    holdings: [holding("SOFI", 2, 30)],
  },
  {
    id: "watch",
    label: "Watch",
    type: "watchlist",
    holdings: [holding("SOFI", 0, 0)],
  },
];

const cycle: CompleteMarketCycle = {
  schemaVersion: 1,
  complete: true,
  cycleKey: "market:cycle:complete:bucket-parity",
  cycleAsOf: "2026-07-27T20:00:00.000Z",
  quotes: {
    SOFI: {
      lastPrice: 25,
      asOf: "2026-07-27T20:00:00.000Z",
      source: "test",
    },
    CUSTOM: {
      lastPrice: 50,
      asOf: "2026-07-27T20:00:00.000Z",
      source: "test",
    },
  },
  fundamentals: {},
  technicals: {},
  byTimeframe: {},
  context: {
    vix: 18,
    spyRsi: 55,
    spyAbove200dSma: 1,
    spy5dChangePct: 1,
    highYieldSpreadPct: 3,
    treasury10y5dChangePct: 0,
    asOf: "2026-07-27T20:00:00.000Z",
    source: "live",
  },
};

function explicitClientAdapter(portfolio: Portfolio) {
  return computeStrategyScopeAlignment({
    portfolio,
    strategy,
    buckets: DEFAULT_BUCKETS,
    marketInputs: {
      market: cycle.context,
      priceOf: (ticker) => cycle.quotes[ticker.toUpperCase()]?.lastPrice ?? 0,
      fundamentalsOf: (ticker) => cycle.fundamentals[ticker.toUpperCase()],
      technicalsOf: (ticker) => cycle.technicals[ticker.toUpperCase()],
      technicalsByTimeframeOf: (ticker) =>
        cycle.byTimeframe[ticker.toUpperCase()],
    },
    allowRuleOverlays: () => true,
    includeZeroShareFallback: true,
  });
}

function independentOldFinalHeadline(
  portfolio: Portfolio,
  ticker: string,
  entryDate?: string,
) {
  const holding = portfolio.holdings.find((row) => row.ticker === ticker)!;
  const priceOf = (symbol: string) =>
    cycle.quotes[symbol.toUpperCase()]?.lastPrice ?? 0;
  const firstPortfolioEntry =
    entryDate ??
    DEFAULT_BUCKETS.filter((bucket) => bucket.portfolioId === portfolio.id)
      .flatMap((bucket) => bucket.holdings)
      .find((allocation) => allocation.ticker === ticker)?.entryDate;
  const entryMs = firstPortfolioEntry ? Date.parse(firstPortfolioEntry) : NaN;
  const asOfMs = Date.parse(cycle.context.asOf);
  return scoreStock(
    strategy,
    {
      market: cycle.context,
      fundamentals: cycle.fundamentals[ticker],
      technicals: cycle.technicals[ticker],
      technicalsByTimeframe: cycle.byTimeframe[ticker],
      weightPct: portfolioWeightPct(portfolio.holdings, ticker, priceOf),
      openPnlPct:
        holding.avgPrice > 0
          ? ((priceOf(ticker) - holding.avgPrice) / holding.avgPrice) * 100
          : undefined,
      holdingDays:
        Number.isNaN(entryMs) || Number.isNaN(asOfMs)
          ? undefined
          : Math.max(0, Math.round((asOfMs - entryMs) / 86_400_000)),
    },
    { hasStrategy: true, allowRuleOverlays: true },
  );
}

describe("server/browser bucket parity", () => {
  it("matches the shared client adapter across slices and fallback scopes", () => {
    const workspace: Workspace = { portfolios, strategies: [strategy] };
    const output = scoreStrategyCheck(workspace, strategy.id, "1h", cycle);

    for (const portfolio of portfolios) {
      const expected = explicitClientAdapter(portfolio);
      for (const [ticker, headline] of Object.entries(expected.byTicker)) {
        const actual = output.results.find(
          (row) => row.portfolio_id === portfolio.id && row.ticker === ticker,
        );
        expect(actual, `${portfolio.id}:${ticker}`).toMatchObject({
          portfolio_id: portfolio.id,
          ticker,
          conviction: headline.alignment.conviction,
          status: headline.alignment.status,
          resolved: headline.alignment.resolved,
          payload: {
            bucketId: headline.bucketId,
            bucketName: headline.bucketName,
            allocationShares: headline.allocationShares,
            entryDate: headline.entryDate,
            categories: headline.alignment.categories,
            results: headline.alignment.results,
            zoneResults: headline.alignment.zoneResults,
          },
        });
      }
      const snapshot = output.portfolioSnapshots.find(
        (row) => row.portfolio_id === portfolio.id,
      );
      if (portfolio.holdings.some((item) => item.shares > 0)) {
        expect(snapshot?.metrics).toEqual(
          expected.portfolio.conviction > 0
            ? { conviction: expected.portfolio.conviction }
            : {},
        );
      } else {
        expect(snapshot).toBeUndefined();
      }
    }

    const seededSofi = output.results.find(
      (row) => row.portfolio_id === "deric" && row.ticker === "SOFI",
    );
    const oldFinalHeadline = independentOldFinalHeadline(
      portfolios[0]!,
      "SOFI",
    );
    const newerBestSlice = independentOldFinalHeadline(
      portfolios[0]!,
      "SOFI",
      "2026-06-24",
    );
    expect(newerBestSlice.conviction).toBeGreaterThan(
      oldFinalHeadline.conviction,
    );
    expect(explicitClientAdapter(portfolios[0]!).byTicker.SOFI.alignment).toEqual(
      oldFinalHeadline,
    );
    expect(seededSofi?.payload).toMatchObject({
      bucketId: "bkt-fintech-consumer",
      allocationShares: 67,
      entryDate: "2026-01-22",
    });
    expect(
      (seededSofi?.payload.results as Array<{
        chip: { id: string };
        outcome: string;
      }>).find((row) => row.chip.id === "vgd-h1")?.outcome,
    ).toBe("fail");

    expect(
      output.results.find(
        (row) => row.portfolio_id === "deric" && row.ticker === "CUSTOM",
      )?.payload,
    ).toMatchObject({ bucketId: `applied-${strategy.id}` });
    expect(
      output.results.filter((row) => row.ticker === "SOFI").map((row) => row.portfolio_id),
    ).toEqual(["deric", "second", "watch"]);
    expect(
      output.results.find(
        (row) => row.portfolio_id === "watch" && row.ticker === "SOFI",
      )?.payload,
    ).toMatchObject({ shares: 0, marketValue: 0 });
  });

  it("persists one merged headline when either differently-cadenced strategy runs", () => {
    const second: Strategy = {
      ...strategy,
      id: "second-strategy",
      name: "Second Strategy",
      checkInterval: "1D",
      rules: [{
        ...newerHoldingChip,
        id: "second-chip",
        operator: ">" as const,
        value: 10,
      }],
    };
    const multiPortfolios = portfolios.map((portfolio) => ({
      ...portfolio,
      holdings: portfolio.holdings.map((row) => ({
        ...row,
        strategyIds: [strategy.id, second.id],
      })),
    }));
    const workspace: Workspace = {
      portfolios: multiPortfolios,
      strategies: [{ ...strategy, checkInterval: "1h" }, second],
    };
    const hourly = scoreAuthoritativeCheck(workspace, strategy.id, "1h", cycle);
    const daily = scoreAuthoritativeCheck(workspace, second.id, "1D", cycle);
    const hourlyMerged = hourly.combinedResults.find(
      (row) => row.portfolio_id === "deric" && row.ticker === "SOFI",
    );
    const dailyMerged = daily.combinedResults.find(
      (row) => row.portfolio_id === "deric" && row.ticker === "SOFI",
    );
    const sofi = multiPortfolios[0]!.holdings.find(
      (holding) => holding.ticker === "SOFI",
    )!;
    const browserMerged = scoreStock(
      mergeStrategiesForScoring([strategy, second]),
      {
        market: cycle.context,
        fundamentals: cycle.fundamentals.SOFI,
        technicals: cycle.technicals.SOFI,
        technicalsByTimeframe: cycle.byTimeframe.SOFI,
        weightPct: portfolioWeightPct(
          multiPortfolios[0]!.holdings,
          "SOFI",
          (ticker) => cycle.quotes[ticker]?.lastPrice ?? 0,
        ),
        openPnlPct: ((cycle.quotes.SOFI!.lastPrice - sofi.avgPrice) /
          sofi.avgPrice) * 100,
        holdingDays: 187,
      },
      { hasStrategy: true, allowRuleOverlays: true },
    );

    expect(hourlyMerged?.strategy_ids).toEqual([strategy.id, second.id].sort());
    expect(hourlyMerged).toMatchObject({
      conviction: browserMerged.conviction,
      status: browserMerged.status,
      resolved: browserMerged.resolved,
      payload: {
        categories: browserMerged.categories,
        results: browserMerged.results,
        zoneResults: browserMerged.zoneResults,
      },
    });
    expect(dailyMerged).toMatchObject({
      conviction: hourlyMerged?.conviction,
      status: hourlyMerged?.status,
      resolved: hourlyMerged?.resolved,
      payload: {
        categories: hourlyMerged?.payload.categories,
        results: hourlyMerged?.payload.results,
        zoneResults: hourlyMerged?.payload.zoneResults,
      },
    });
    expect(hourly.results.every((row) => row.payload.cycleKey === cycle.cycleKey))
      .toBe(true);
    expect(daily.results.every((row) => row.payload.cycleKey === cycle.cycleKey))
      .toBe(true);
  });

  it("writes whole-book metrics while excluding untracked P&L", () => {
    const tracked = holding("SOFI", 2, 20);
    const untracked = {
      ...holding("CUSTOM", 1, 100),
      strategyIds: [] as string[],
    };
    const scopedStrategy = { ...strategy, appliedPortfolioIds: ["book"] };
    const output = scoreAuthoritativeCheck(
      {
        portfolios: [{
          id: "book",
          label: "Book",
          type: "portfolio",
          cashAvailable: 10,
          holdings: [tracked, untracked],
        }],
        strategies: [scopedStrategy],
      },
      scopedStrategy.id,
      "1h",
      cycle,
    );
    const snapshot = output.wholeBookSnapshots[0]!;
    expect(snapshot.open_pnl_pct).toBeCloseTo(-40 / 140 * 100);
    expect(snapshot.metrics.trackedOpenPnlPct).toBeCloseTo(10 / 40 * 100);
    expect(snapshot.metrics.conviction).toBeTypeOf("number");
  });

  it("preflight required tickers match shouldScore holdings only", () => {
    const assigned = holding("CELH", 1, 10);
    const otherStrategyOnly = {
      ...holding("NVDA", 1, 100),
      strategyIds: ["aggressive-ai-high-beta"],
    };
    const scopedStrategy = {
      ...strategy,
      isDefault: true,
      appliedPortfolioIds: ["book"],
    };
    const workspace: Workspace = {
      portfolios: [{
        id: "book",
        label: "Book",
        type: "portfolio",
        holdings: [assigned, otherStrategyOnly],
      }],
      strategies: [scopedStrategy],
    };
    expect(requiredTickersForStrategyCheck(workspace, scopedStrategy)).toEqual([
      "CELH",
    ]);
  });
});
