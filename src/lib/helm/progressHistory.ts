import {
  fetchConvictionSnapshots,
  fetchForgeCheckEvents,
  fetchPortfolioSnapshots,
  type ConvictionSnapshotRecord,
  type PortfolioSnapshotRecord,
} from "../userStore";
import type { ForgeCheckEvent } from "../forge/planAdherence";
import { measureAsync, perfCount, perfValue } from "../performance/marks";

export interface ProgressHistoryInput {
  userId: string;
  portfolioId: string;
  strategyId: string | null;
  appliedStrategyIds: string[];
  tickers: string[];
  recentFrom: string;
  eventsFromIso: string;
  eventsToIso: string;
}

export interface ProgressHistory {
  bookRows: PortfolioSnapshotRecord[];
  scopedBookRows: PortfolioSnapshotRecord[];
  tickerRows: ConvictionSnapshotRecord[];
  events: ForgeCheckEvent[];
}

const inFlight = new Map<string, Promise<ProgressHistory>>();

function keyOf(input: ProgressHistoryInput): string {
  return JSON.stringify({
    ...input,
    appliedStrategyIds: [...input.appliedStrategyIds].sort(),
    tickers: [...input.tickers].sort(),
  });
}

export function fetchProgressHistory(
  input: ProgressHistoryInput,
): Promise<ProgressHistory> {
  const key = keyOf(input);
  const existing = inFlight.get(key);
  if (existing) {
    perfCount("helm-history-deduped");
    return existing;
  }

  perfCount("helm-history-query-group");
  const strategyIds = input.strategyId
    ? [input.strategyId]
    : input.appliedStrategyIds;
  const selectedIds = input.strategyId
    ? input.appliedStrategyIds.filter((id) => id === input.strategyId)
    : input.appliedStrategyIds;

  const request = measureAsync("helm-history-query-group", async () => {
    const [bookRows, scopedRows, tickerRows, events] = await Promise.all([
      fetchPortfolioSnapshots({
        userId: input.userId,
        portfolioId: input.portfolioId,
        strategyId: input.strategyId,
      }),
      Promise.all(
        selectedIds.map((strategyId) =>
          fetchPortfolioSnapshots({
            userId: input.userId,
            portfolioId: input.portfolioId,
            strategyId,
            from: input.recentFrom,
          }),
        ),
      ),
      strategyIds.length > 0 && input.tickers.length > 0
        ? fetchConvictionSnapshots({
            userId: input.userId,
            strategyIds,
            tickers: input.tickers,
            from: input.recentFrom,
          })
        : Promise.resolve([]),
      fetchForgeCheckEvents({
        userId: input.userId,
        portfolioId: input.portfolioId,
        strategyIds,
        fromIso: input.eventsFromIso,
        toIso: input.eventsToIso,
      }),
    ]);
    const result = {
      bookRows,
      scopedBookRows: scopedRows.flat(),
      tickerRows,
      events,
    };
    perfValue(
      "helm-history-rows",
      result.bookRows.length +
        result.scopedBookRows.length +
        result.tickerRows.length +
        result.events.length,
    );
    return result;
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, request);
  return request;
}

