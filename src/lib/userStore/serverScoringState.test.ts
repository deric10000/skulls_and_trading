import { describe, expect, it } from "vitest";
import {
  combinedResultMatchesScope,
  filterCurrentStrategyCheckResults,
  mapStrategyCheckCombinedResultRows,
  mapStrategyCheckLatestResultRows,
  mapStrategyCheckScheduleRows,
  mapStrategyCheckStateRows,
} from "./index";

describe("normalized server scoring state", () => {
  it("preserves independent cadence stamps and schedules", () => {
    const state = mapStrategyCheckStateRows([
      {
        strategy_id: "strategy",
        cadence: "1h",
        last_cycle_as_of: "2026-07-27T20:00:00.000Z",
      },
      {
        strategy_id: "strategy",
        cadence: "close-regular",
        last_cycle_as_of: "2026-07-26T20:00:00.000Z",
      },
    ]);
    const schedules = mapStrategyCheckScheduleRows([
      {
        strategy_id: "strategy",
        cadence: "1h",
        next_due_at: "2026-07-27T21:00:00.000Z",
        definition_hash: "hourly",
      },
      {
        strategy_id: "strategy",
        cadence: "close-regular",
        next_due_at: "2026-07-28T20:00:00.000Z",
        definition_hash: "close",
      },
    ]);

    expect(state.map((row) => [row.cadence, row.lastCycleAsOf])).toEqual([
      ["1h", "2026-07-27T20:00:00.000Z"],
      ["close-regular", "2026-07-26T20:00:00.000Z"],
    ]);
    expect(schedules.map((row) => [row.cadence, row.nextDueAt])).toEqual([
      ["1h", "2026-07-27T21:00:00.000Z"],
      ["close-regular", "2026-07-28T20:00:00.000Z"],
    ]);
  });

  it("does not collapse one ticker across portfolios", () => {
    const rows = mapStrategyCheckLatestResultRows([
      {
        portfolio_id: "book-a",
        strategy_id: "strategy",
        ticker: "same",
        run_id: "run-a",
        cycle_as_of: "2026-07-27T20:00:00.000Z",
        definition_hash: "current",
        workspace_updated_at: "2026-07-27T19:55:00.000Z",
        conviction: 80,
        status: "Aligned",
        resolved: { primary: "Aligned" },
        payload: { openPnlPct: 20 },
      },
      {
        portfolio_id: "book-b",
        strategy_id: "strategy",
        ticker: "same",
        run_id: "run-b",
        cycle_as_of: "2026-07-27T20:00:00.000Z",
        definition_hash: "current",
        workspace_updated_at: "2026-07-27T19:55:00.000Z",
        conviction: 30,
        status: "Watch",
        resolved: { primary: "Watch" },
        payload: { openPnlPct: -10 },
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.portfolioId, row.ticker, row.conviction]))
      .toEqual([
        ["book-a", "SAME", 80],
        ["book-b", "SAME", 30],
      ]);
  });

  it("rejects results from a superseded strategy definition", () => {
    const rows = mapStrategyCheckLatestResultRows([
      {
        portfolio_id: "book",
        strategy_id: "strategy",
        ticker: "same",
        run_id: "run",
        cycle_as_of: "2026-07-27T20:00:00.000Z",
        definition_hash: "old",
        workspace_updated_at: "2026-07-27T19:55:00.000Z",
        conviction: 80,
        status: "Aligned",
        resolved: { primary: "Aligned" },
        payload: {},
      },
    ]);
    const schedules = mapStrategyCheckScheduleRows([
      {
        strategy_id: "strategy",
        cadence: "1h",
        next_due_at: "2026-07-27T21:00:00.000Z",
        definition_hash: "new",
      },
    ]);

    expect(filterCurrentStrategyCheckResults(rows, schedules)).toEqual([]);
  });

  it("requires an exact combined strategy set and every current revision", () => {
    const [combined] = mapStrategyCheckCombinedResultRows([{
      portfolio_id: "book",
      ticker: "same",
      strategy_ids: ["alpha", "beta"],
      input_revision: { alpha: ["a-1h"], beta: ["b-1d"] },
      run_id: "run",
      cycle_as_of: "2026-07-27T20:00:00.000Z",
      cycle_key: "cycle",
      workspace_updated_at: "2026-07-27T19:55:00.000Z",
      conviction: 77,
      status: "Aligned",
      resolved: { primary: "Aligned" },
      payload: {},
    }]);
    const schedules = mapStrategyCheckScheduleRows([
      {
        strategy_id: "alpha",
        cadence: "1h",
        next_due_at: "2026-07-27T21:00:00.000Z",
        definition_hash: "a-1h",
      },
      {
        strategy_id: "beta",
        cadence: "1D",
        next_due_at: "2026-07-28T20:00:00.000Z",
        definition_hash: "b-1d",
      },
    ]);

    expect(combinedResultMatchesScope(combined!, ["beta", "alpha"], schedules))
      .toBe(true);
    expect(combinedResultMatchesScope(combined!, ["alpha"], schedules))
      .toBe(false);
    expect(combinedResultMatchesScope(combined!, ["alpha", "beta"], [
      ...schedules.slice(0, 1),
      { ...schedules[1]!, definitionHash: "b-changed" },
    ])).toBe(false);
  });

  it("keeps the same combined ticker isolated across portfolios", () => {
    const rows = mapStrategyCheckCombinedResultRows([
      {
        portfolio_id: "book-a",
        ticker: "same",
        strategy_ids: ["alpha"],
        input_revision: { alpha: ["hash"] },
        run_id: "a",
        cycle_as_of: "2026-07-27T20:00:00.000Z",
        cycle_key: "cycle",
        workspace_updated_at: "2026-07-27T19:55:00.000Z",
        conviction: 80,
        resolved: {},
        payload: {},
      },
      {
        portfolio_id: "book-b",
        ticker: "same",
        strategy_ids: ["alpha"],
        input_revision: { alpha: ["hash"] },
        run_id: "b",
        cycle_as_of: "2026-07-27T20:00:00.000Z",
        cycle_key: "cycle",
        workspace_updated_at: "2026-07-27T19:55:00.000Z",
        conviction: 20,
        resolved: {},
        payload: {},
      },
    ]);
    expect(rows.map((row) => [row.portfolioId, row.conviction])).toEqual([
      ["book-a", 80],
      ["book-b", 20],
    ]);
  });
});
