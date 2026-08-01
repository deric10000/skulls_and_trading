import type {
  PendingCashEdit,
  PendingQtyOrder,
  Portfolio,
  Strategy,
} from "../../types";
import type { PortfolioAlignment } from "../forge/alignment";
import type { CommitCurrentWatchEditResult } from "../userStore/currentWatchEditStore";
import { commitCurrentWatchEdit } from "../userStore/currentWatchEditStore";
import { buildCurrentWatchEditCommit } from "./currentWatchEditCommit";

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildCurrentWatchPendingReview(input: {
  baseline: Record<string, number>;
  drafts: Record<string, number>;
  cashOffset: number;
  cashBaseline: number;
  qtyImpact: number;
  getLastPrice: (ticker: string) => number;
  filledAt: string;
  timeZone: string;
}): { orders: PendingQtyOrder[]; cash: PendingCashEdit | null } {
  const tickers = new Set([
    ...Object.keys(input.baseline),
    ...Object.keys(input.drafts),
  ]);
  const orders = [...tickers]
    .flatMap((ticker): PendingQtyOrder[] => {
      const sharesBefore = input.baseline[ticker] ?? 0;
      const sharesAfter = input.drafts[ticker] ?? sharesBefore;
      const delta = sharesAfter - sharesBefore;
      if (delta === 0) return [];
      return [{
        ticker,
        side: delta > 0 ? "buy" : "sell",
        deltaShares: Math.abs(delta),
        sharesBefore,
        sharesAfter,
        fillPrice: money(input.getLastPrice(ticker)),
        filledAt: input.filledAt,
        timeZone: input.timeZone,
      }];
    })
    .sort((left, right) => left.ticker.localeCompare(right.ticker));
  if (Math.abs(input.cashOffset) < 0.005) return { orders, cash: null };
  const cashBefore = money(input.cashBaseline + input.qtyImpact);
  const cashAfter = money(cashBefore + input.cashOffset);
  return {
    orders,
    cash: {
      side: input.cashOffset > 0 ? "deposit" : "withdrawal",
      cashBefore,
      cashAfter,
      deltaCash: money(input.cashOffset),
      filledAt: input.filledAt,
      timeZone: input.timeZone,
    },
  };
}

export function buildAdditionalPendingOrder(input: {
  side: "buy" | "sell";
  ticker: string;
  sharesBefore: number;
  lastPrice: number;
  filledAt: string;
  timeZone: string;
}): PendingQtyOrder {
  const deltaShares = input.side === "sell" ? Math.min(1, input.sharesBefore) : 1;
  const signedDelta = input.side === "buy" ? deltaShares : -deltaShares;
  return {
    ticker: input.ticker,
    side: input.side,
    deltaShares,
    sharesBefore: input.sharesBefore,
    sharesAfter:
      Math.round(Math.max(0, input.sharesBefore + signedDelta) * 1_000_000) /
      1_000_000,
    fillPrice: money(input.lastPrice),
    filledAt: input.filledAt,
    timeZone: input.timeZone,
  };
}

export function reviewCurrentWatchTimeline(input: {
  orders: PendingQtyOrder[];
  cash: PendingCashEdit | null;
  startingCash: number;
}):
  | {
      orders: PendingQtyOrder[];
      cash: PendingCashEdit | null;
      finalCash: number;
    }
  | { error: string } {
  if (input.orders.some(
    (order) =>
      !/^[A-Z][A-Z0-9.-]{0,9}$/.test(order.ticker) ||
      !(order.deltaShares > 0) ||
      !(order.fillPrice > 0) ||
      order.sharesAfter < 0 ||
      (order.side === "sell" && order.deltaShares > order.sharesBefore),
  )) return { error: "Review ticker, quantity, holdings, and fill price before confirming." };

  let timelineCash = money(input.startingCash);
  let cashBefore = timelineCash;
  let cashAfter = timelineCash;
  const reviewed = new Map<number, PendingQtyOrder>();
  const timeline = [
    ...input.orders.map((order, index) => ({ kind: "qty" as const, order, index })),
    ...(input.cash ? [{ kind: "cash" as const, cash: input.cash, index: -1 }] : []),
  ].sort((left, right) => {
    const leftAt = left.kind === "qty" ? left.order.filledAt : left.cash.filledAt;
    const rightAt = right.kind === "qty" ? right.order.filledAt : right.cash.filledAt;
    return Date.parse(leftAt) - Date.parse(rightAt) || left.index - right.index;
  });
  for (const event of timeline) {
    if (event.kind === "cash") {
      cashBefore = timelineCash;
      timelineCash = money(timelineCash + event.cash.deltaCash);
      cashAfter = timelineCash;
    } else {
      const before = timelineCash;
      const tradeValue = money(event.order.deltaShares * event.order.fillPrice);
      timelineCash = money(
        event.order.side === "sell"
          ? timelineCash + tradeValue
          : timelineCash - tradeValue,
      );
      reviewed.set(event.index, {
        ...event.order,
        cashBefore: before,
        cashAfter: timelineCash,
      });
    }
    if (timelineCash < 0) {
      return { error: "Not enough cash at that point in the reviewed timeline. Move the deposit earlier or reduce the purchase." };
    }
  }
  return {
    orders: input.orders.map((order, index) => reviewed.get(index) ?? order),
    cash: input.cash
      ? {
          ...input.cash,
          cashBefore,
          cashAfter,
          deltaCash: money(cashAfter - cashBefore),
        }
      : null,
    finalCash: timelineCash,
  };
}

export async function executeCurrentWatchEdit(input: {
  portfolio: Portfolio;
  strategies: Strategy[];
  alignment: PortfolioAlignment;
  appliedStrategyIds: string[];
  getLastPrice: (ticker: string) => number;
  orders: PendingQtyOrder[];
  cash: PendingCashEdit | null;
  finalCash: number;
  historyRemovalTickers: string[];
  nextId: (prefix: string) => string;
  userId: string | null;
}): Promise<
  | {
      status: "applied";
      portfolio: Portfolio;
      transactions: ReturnType<typeof buildCurrentWatchEditCommit>["transactions"];
      durable: CommitCurrentWatchEditResult;
    }
  | { status: "conflict" | "failed" }
> {
  const prepared = buildCurrentWatchEditCommit(input);
  if (!input.userId) {
    return {
      status: "applied",
      ...prepared,
      durable: {
        revision: (input.portfolio.revision ?? 0) + 1,
        historyArchives: [],
      },
    };
  }
  try {
    const durable = await commitCurrentWatchEdit(
      {
        portfolioId: input.portfolio.id,
        expectedRevision: input.portfolio.revision ?? 0,
        portfolio: prepared.portfolio,
        strategies: input.strategies,
        transactions: prepared.transactions,
        historyRemovalTickers: input.historyRemovalTickers,
      },
      input.userId,
    );
    return { status: "applied", ...prepared, durable };
  } catch (error) {
    return error instanceof Error &&
      error.message === "PORTFOLIO_REVISION_CONFLICT"
      ? { status: "conflict" }
      : { status: "failed" };
  }
}
