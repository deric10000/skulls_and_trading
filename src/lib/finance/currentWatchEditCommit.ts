import type {
  PendingCashEdit,
  PendingQtyOrder,
  Portfolio,
  PortfolioTransaction,
} from "../../types";
import type { PortfolioAlignment } from "../forge/alignment";
import { nextAverageCost, openPnlPercent } from "./averageCost";
import {
  classifyCashAction,
  classifyQtyAction,
  zoneHintsFromStatuses,
} from "./portfolioTransactions";
import { compareCurrentWatchTimelineEvents } from "./currentWatchTimelineOrder";
import { estimateFillTimestamp } from "./timestamps";

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildCurrentWatchEditCommit(input: {
  portfolio: Portfolio;
  alignment: PortfolioAlignment;
  appliedStrategyIds: string[];
  getLastPrice: (ticker: string) => number;
  orders: PendingQtyOrder[];
  cash: PendingCashEdit | null;
  finalCash: number;
  nextId: (prefix: string) => string;
}): { portfolio: Portfolio; transactions: PortfolioTransaction[] } {
  const { portfolio } = input;
  const orders = [...input.orders].sort((left, right) =>
    compareCurrentWatchTimelineEvents(
      { filledAt: left.filledAt, kind: "qty" },
      { filledAt: right.filledAt, kind: "qty" },
    ),
  );
  const qtyTransactions: PortfolioTransaction[] = orders.map((order) => {
    const holding = portfolio.holdings.find(
      (item) => item.ticker === order.ticker,
    );
    const live =
      input.alignment.byTicker[order.ticker.toUpperCase()] ??
      input.alignment.byTicker[order.ticker];
    const tradeValue = cents(order.deltaShares * order.fillPrice);
    const cashBefore = order.cashBefore ?? cents(portfolio.cashAvailable ?? 0);
    const cashAfter =
      order.cashAfter ??
      cents(
        order.side === "sell"
          ? cashBefore + tradeValue
          : cashBefore - tradeValue,
      );
    return {
      id: input.nextId("fill"),
      kind: "qty",
      portfolioId: portfolio.id,
      ticker: order.ticker,
      side: order.side,
      deltaShares: order.deltaShares,
      sharesBefore: order.sharesBefore,
      sharesAfter: order.sharesAfter,
      fillPrice: order.fillPrice,
      filledAt: order.filledAt || estimateFillTimestamp(),
      timeZone:
        order.timeZone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "UTC",
      cashBefore,
      cashAfter,
      source: "mock",
      actionClass: classifyQtyAction({
        sharesBefore: order.sharesBefore,
        sharesAfter: order.sharesAfter,
      }),
      strategyIds: holding?.strategyIds?.length
        ? [...holding.strategyIds]
        : input.appliedStrategyIds,
      zoneHints: zoneHintsFromStatuses([
        live?.resolved.primary,
        ...(live?.resolved.categoryFlags ?? []),
        holding?.status,
      ]),
    };
  });
  const cashTransaction: PortfolioTransaction | null =
    input.cash && input.cash.cashAfter !== input.cash.cashBefore
      ? {
          id: input.nextId("cash"),
          kind: "cash",
          portfolioId: portfolio.id,
          cashBefore: input.cash.cashBefore,
          cashAfter: input.cash.cashAfter,
          deltaCash: input.cash.deltaCash,
          filledAt: input.cash.filledAt,
          timeZone:
            input.cash.timeZone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC",
          source: "mock",
          actionClass: classifyCashAction({
            cashBefore: input.cash.cashBefore,
            cashAfter: input.cash.cashAfter,
          }),
          strategyIds: input.appliedStrategyIds,
        }
      : null;
  // Emit in the same order the server replays (filledAt, cash-before-qty ties).
  const transactions = [
    ...qtyTransactions.map((tx) => ({ kind: "qty" as const, tx })),
    ...(cashTransaction
      ? [{ kind: "cash" as const, tx: cashTransaction }]
      : []),
  ]
    .sort((left, right) =>
      compareCurrentWatchTimelineEvents(
        { filledAt: left.tx.filledAt, kind: left.kind },
        { filledAt: right.tx.filledAt, kind: right.kind },
      ),
    )
    .map((entry) => entry.tx);

  let holdings = portfolio.holdings.map((holding) => ({
    ...holding,
    strategyIds: [...holding.strategyIds],
  }));
  for (const order of orders) {
    if (!holdings.some((holding) => holding.ticker === order.ticker)) {
      holdings.push({
        ticker: order.ticker,
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 0,
        status: "No Strategy",
        reason: "Pending the next strategy check.",
        strategyIds: [...input.appliedStrategyIds],
      });
    }
    holdings = holdings.map((holding) => {
      if (holding.ticker !== order.ticker) return holding;
      const avgPrice = nextAverageCost({
        sharesBefore: order.sharesBefore,
        avgBefore: holding.avgPrice,
        side: order.side,
        deltaShares: order.deltaShares,
        fillPrice: order.fillPrice,
        sharesAfter: order.sharesAfter,
      });
      const last = input.getLastPrice(order.ticker);
      return {
        ...holding,
        shares: order.sharesAfter,
        avgPrice,
        openPnlPct: openPnlPercent(last, avgPrice),
      };
    });
  }
  return {
    portfolio: {
      ...portfolio,
      holdings,
      cashAvailable:
        portfolio.type === "watchlist"
          ? portfolio.cashAvailable
          : cents(input.finalCash),
    },
    transactions,
  };
}
