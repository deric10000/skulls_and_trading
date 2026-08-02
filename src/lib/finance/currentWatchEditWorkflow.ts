import type {
  PendingCashEdit,
  PendingQtyOrder,
  Portfolio,
  Strategy,
} from "../../types";
import type { PortfolioAlignment } from "../forge/alignment";
import type {
  CommitCurrentWatchEditResult,
  CurrentWatchCommitFailureReason,
} from "../userStore/currentWatchEditStore";
import {
  commitCurrentWatchEdit,
  CurrentWatchCommitError,
} from "../userStore/currentWatchEditStore";
import { buildCurrentWatchEditCommit } from "./currentWatchEditCommit";
import { compareCurrentWatchTimelineEvents } from "./currentWatchTimelineOrder";

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function cashDraftForBatch(
  cash: PendingCashEdit | null,
  cashBaseline: number,
): { cash: PendingCashEdit | null; error: string | null } {
  if (!cash) return { cash: null, error: null };
  if (cash.side === "deposit" && cashBaseline <= 0.005) {
    return { cash, error: null };
  }
  return {
    cash: null,
    error:
      "Update or cancel the staged cash change before opening Batch Transactions.",
  };
}

export function currentWatchCommitFailureMessage(
  reason: CurrentWatchCommitFailureReason,
): string {
  switch (reason) {
    case "schema-unavailable":
      return "Current Watch saving is not installed in this environment. Apply the Current Watch database migrations, then reopen Edit Mode.";
    case "session-expired":
      return "Your sign-in session expired. Sign in again, then retry this update.";
    case "portfolio-not-found":
      return "This portfolio no longer exists in the saved account data. Refresh Current Watch and reopen Edit Mode.";
    case "invalid-math":
      return "The reviewed cash or share totals no longer match the saved portfolio. Cancel, reopen Edit Mode, and review the deposit and orders.";
    case "invalid-data":
      return "The server rejected a transaction value. Review the ticker, quantity, fill price, date/time, and time zone.";
    case "ticker-limit":
      return "This update would exceed the 40-ticker limit. Remove a tracked ticker, then try again.";
    case "permission-denied":
      return "Your account is not permitted to update this portfolio. Sign in to the correct account or contact the Admin Captain.";
    case "save-unavailable":
      return "The save service could not be reached. Check your connection and try again; your edits are still open.";
  }
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
  // Same-timestamp reviews apply cash before qty (see timeline order helper),
  // so deposit/withdraw display against starting cash — not post-trade cash.
  const cashBefore = money(input.cashBaseline);
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
    ...input.orders.map((order, index) => ({
      kind: "qty" as const,
      filledAt: order.filledAt,
      order,
      index,
    })),
    ...(input.cash
      ? [{
          kind: "cash" as const,
          filledAt: input.cash.filledAt,
          cash: input.cash,
          index: -1,
        }]
      : []),
  ].sort((left, right) => {
    const byKindTime = compareCurrentWatchTimelineEvents(left, right);
    if (byKindTime !== 0) return byKindTime;
    return left.index - right.index;
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
  | { status: "conflict" }
  | { status: "failed"; reason: CurrentWatchCommitFailureReason }
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
    return error instanceof CurrentWatchCommitError
      ? error.reason === "conflict"
        ? { status: "conflict" }
        : { status: "failed", reason: error.reason }
      : { status: "failed", reason: "save-unavailable" };
  }
}
