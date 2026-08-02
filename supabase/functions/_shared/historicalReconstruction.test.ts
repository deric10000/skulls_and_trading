import { describe, expect, it, vi } from "vitest";
import type { Portfolio, Strategy } from "../../../src/types";
import {
  applyHistoricalTransaction,
  reconstructHistoricalChunk,
  type HistoricalJob,
  type HistoricalTransactionRow,
} from "./historicalReconstruction";

const portfolio: Portfolio = {
  id: "portfolio-1",
  label: "Current Watch",
  type: "portfolio",
  createdAt: "2026-07-20T12:00:00.000Z",
  cashAvailable: 1_000,
  holdings: [],
};

const strategy: Strategy = {
  id: "strategy-1",
  name: "Disciplined Growth",
  description: "Test strategy",
  isDefault: false,
  enabled: true,
  timeframe: ["Swing"],
  tags: [],
  decisionSignals: [],
  exitLogic: [],
  appliedPortfolioIds: [portfolio.id],
};

function job(overrides: Partial<HistoricalJob> = {}): HistoricalJob {
  return {
    id: "history:import-1",
    user_id: "user-1",
    import_batch_id: "import-1",
    portfolio_id: portfolio.id,
    score_window_start: "2026-07-25T12:00:00.000Z",
    score_window_end: "2026-08-01T12:00:00.000Z",
    working_portfolio: portfolio,
    cursor_filled_at: null,
    cursor_transaction_id: null,
    ...overrides,
  };
}

function buy(overrides: Partial<HistoricalTransactionRow> = {}): HistoricalTransactionRow {
  return {
    id: "import-1:row:1",
    portfolio_id: portfolio.id,
    kind: "qty",
    transaction_type: "buy",
    ticker: "AAPL",
    quantity: 2,
    fill_price: 100,
    filled_at: "2026-07-30T15:30:00.000Z",
    shares_before: 0,
    shares_after: 2,
    cash_before: 1_000,
    cash_after: 800,
    ...overrides,
  };
}

describe("historical transaction reconstruction", () => {
  it("applies every transaction to replay state, including an old unscored row", async () => {
    const result = await reconstructHistoricalChunk({
      job: job(),
      transactions: [buy({ filled_at: "2026-07-24T15:30:00.000Z" })],
      versions: [],
      applications: [],
      tickerApplications: [],
      fetchCycle: vi.fn(),
    });
    expect(result.results[0]).toMatchObject({
      status: "skipped",
      reason: "outside_seven_day_window",
    });
    expect(result.workingPortfolio.holdings[0]).toMatchObject({
      ticker: "AAPL",
      shares: 2,
      avgPrice: 100,
    });
    expect(result.workingPortfolio.cashAvailable).toBe(800);
  });

  it("does not guess a default-strategy ticker assignment", async () => {
    const fetchCycle = vi.fn();
    const result = await reconstructHistoricalChunk({
      job: job(),
      transactions: [buy()],
      versions: [{
        id: "strategy-1:v1",
        strategy_id: strategy.id,
        effective_from: "2026-07-25T12:00:00.000Z",
        effective_to: null,
        snapshot: { ...strategy, isDefault: true },
      }],
      applications: [{
        strategy_id: strategy.id,
        portfolio_id: portfolio.id,
        applied_at: "2026-07-25T12:00:00.000Z",
        removed_at: null,
      }],
      tickerApplications: [],
      fetchCycle,
    });
    expect(result.results[0]).toMatchObject({
      status: "unscored",
      reason: "no_effective_strategy_assignment",
    });
    expect(fetchCycle).not.toHaveBeenCalled();
  });

  it("honors durable untrackedClose sells without poisoning later rows", async () => {
    const fetchCycle = vi.fn(async () => ({
      schemaVersion: 1 as const,
      complete: true as const,
      cycleKey: "market:cycle:complete:20260730T150000000Z",
      cycleAsOf: "2026-07-30T15:00:00.000Z",
      quotes: {
        ACHR: { lastPrice: 10, asOf: "2026-07-30T15:00:00.000Z", source: "test" },
        AAPL: { lastPrice: 99, asOf: "2026-07-30T15:00:00.000Z", source: "test" },
      },
      fundamentals: { ACHR: {}, AAPL: {} },
      technicals: { ACHR: {}, AAPL: {} },
      byTimeframe: { ACHR: {}, AAPL: {} },
      context: { asOf: "2026-07-30T15:00:00.000Z" },
    }) as never);
    const result = await reconstructHistoricalChunk({
      job: job(),
      transactions: [
        {
          id: "import-1:row:1",
          portfolio_id: portfolio.id,
          kind: "qty",
          transaction_type: "sell",
          ticker: "ACHR",
          quantity: 5,
          fill_price: 8,
          filled_at: "2026-07-30T14:30:00.000Z",
          shares_before: 5,
          shares_after: 0,
          cash_before: 1_000,
          cash_after: 1_000,
          untracked_close: true,
        },
        buy({
          id: "import-1:row:2",
          filled_at: "2026-07-30T15:30:00.000Z",
        }),
      ],
      versions: [{
        id: "strategy-1:v1",
        strategy_id: strategy.id,
        effective_from: "2026-07-25T12:00:00.000Z",
        effective_to: null,
        snapshot: strategy,
      }],
      applications: [{
        strategy_id: strategy.id,
        portfolio_id: portfolio.id,
        applied_at: "2026-07-25T12:00:00.000Z",
        removed_at: null,
      }],
      tickerApplications: [],
      fetchCycle,
    });
    expect(result.results[0]?.reason).not.toBe("portfolio_replay_mismatch");
    expect(result.workingPortfolio.historicalReplayReliable).not.toBe(false);
    expect(result.results[1]).toMatchObject({
      status: "scored",
      strategyIds: [strategy.id],
    });
  });

  it("does not score when durable before-values disagree with replay state", async () => {
    const fetchCycle = vi.fn();
    const result = await reconstructHistoricalChunk({
      job: job(),
      transactions: [buy({ shares_before: 1, shares_after: 3 })],
      versions: [{
        id: "strategy-1:v1",
        strategy_id: strategy.id,
        effective_from: "2026-07-25T12:00:00.000Z",
        effective_to: null,
        snapshot: strategy,
      }],
      applications: [{
        strategy_id: strategy.id,
        portfolio_id: portfolio.id,
        applied_at: "2026-07-25T12:00:00.000Z",
        removed_at: null,
      }],
      tickerApplications: [],
      fetchCycle,
    });
    expect(result.results[0]).toMatchObject({
      status: "incomplete",
      reason: "portfolio_replay_mismatch",
    });
    expect(result.workingPortfolio.historicalReplayReliable).toBe(false);
    expect(fetchCycle).not.toHaveBeenCalled();

    const dependent = await reconstructHistoricalChunk({
      job: job({ working_portfolio: result.workingPortfolio }),
      transactions: [buy({
        id: "import-1:row:2",
        quantity: 1,
        shares_before: 3,
        shares_after: 4,
        cash_before: 800,
        cash_after: 700,
      })],
      versions: [{
        id: "strategy-1:v1",
        strategy_id: strategy.id,
        effective_from: "2026-07-25T12:00:00.000Z",
        effective_to: null,
        snapshot: strategy,
      }],
      applications: [{
        strategy_id: strategy.id,
        portfolio_id: portfolio.id,
        applied_at: "2026-07-25T12:00:00.000Z",
        removed_at: null,
      }],
      tickerApplications: [],
      fetchCycle,
    });
    expect(dependent.results[0]?.reason).toBe("portfolio_replay_mismatch");
    expect(fetchCycle).not.toHaveBeenCalled();
  });

  it("binds a custom strategy transaction to at-or-before market evidence", async () => {
    const fetchCycle = vi.fn(async () => ({
      schemaVersion: 1 as const,
      complete: true as const,
      cycleKey: "market:cycle:complete:20260730T150000000Z",
      cycleAsOf: "2026-07-30T15:00:00.000Z",
      quotes: {
        AAPL: { lastPrice: 99, asOf: "2026-07-30T15:00:00.000Z", source: "test" },
      },
      fundamentals: { AAPL: {} },
      technicals: { AAPL: {} },
      byTimeframe: { AAPL: {} },
      context: { asOf: "2026-07-30T15:00:00.000Z" },
    }) as never);
    const result = await reconstructHistoricalChunk({
      job: job(),
      transactions: [buy()],
      versions: [{
        id: "strategy-1:v1",
        strategy_id: strategy.id,
        effective_from: "2026-07-25T12:00:00.000Z",
        effective_to: null,
        snapshot: strategy,
      }],
      applications: [{
        strategy_id: strategy.id,
        portfolio_id: portfolio.id,
        applied_at: "2026-07-25T12:00:00.000Z",
        removed_at: null,
      }],
      tickerApplications: [],
      fetchCycle,
    });
    expect(fetchCycle).toHaveBeenCalledWith(
      "2026-07-30T15:30:00.000Z",
      ["AAPL"],
    );
    expect(result.results[0]).toMatchObject({
      status: "scored",
      cycleAsOf: "2026-07-30T15:00:00.000Z",
      strategyIds: [strategy.id],
      strategyVersionIds: ["strategy-1:v1"],
    });
  });

  it("keeps weighted average cost deterministic across replay chunks", () => {
    const afterFirst = applyHistoricalTransaction(portfolio, buy(), [strategy.id]);
    const afterSecond = applyHistoricalTransaction(
      afterFirst,
      buy({
        id: "import-1:row:2",
        quantity: 2,
        fill_price: 200,
        shares_before: 2,
        shares_after: 4,
        cash_before: 800,
        cash_after: 400,
      }),
      [strategy.id],
    );
    expect(afterSecond.holdings[0]?.avgPrice).toBe(150);
  });
});
