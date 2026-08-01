import { useState, type ComponentType } from "react";
import type {
  PendingCashEdit,
  PendingQtyOrder,
  PortfolioHolding,
  WatchlistItem,
} from "../../types";
import {
  formatFractionalQuantityInput,
  roundQuantity,
} from "../../lib/finance/currentWatchTransactions";
import { qtySideFromDelta } from "../../lib/finance/averageCost";
import { roundMoney } from "../../lib/finance/editCashFromQty";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "../../lib/finance/timestamps";
import { formatPrice } from "../../lib/format";
import { Trash } from "../../lib/icons";
import { Tooltip } from "../Tooltip";
import { ForgeTableModal } from "../forge/ForgeTableModal";
import { RowMessage } from "../RowMessage";
import type { CurrentWatchTickerSearchProps } from "./CurrentWatchTickerSearch";
import { FractionalSharesButton } from "./FractionalSharesButton";

export interface PendingEditReview {
  orders: PendingQtyOrder[];
  cash: PendingCashEdit | null;
  isBatch?: boolean;
}

export function CurrentWatchOrderReviewModal({
  review,
  holdings,
  tickerOptions,
  TickerSearch,
  getMarkPrice,
  searchTickers,
  onChange,
  onCancel,
  onConfirm,
  onAdd,
  onAddTicker,
}: {
  review: PendingEditReview;
  holdings: PortfolioHolding[];
  tickerOptions: Pick<WatchlistItem, "ticker" | "name">[];
  TickerSearch: ComponentType<CurrentWatchTickerSearchProps>;
  getMarkPrice: (ticker: string) => number;
  searchTickers: (query: string) => Promise<CurrentWatchTickerSearchProps["suggestions"]>;
  onChange: (review: PendingEditReview) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onAdd: (side: "buy" | "sell") => void;
  onAddTicker: (
    ticker: string,
  ) => "added" | "exists" | "no-data" | "budget";
}) {
  const [submitting, setSubmitting] = useState(false);
  const [tickerErrors, setTickerErrors] = useState<Record<number, string>>({});
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {},
  );
  const [fractionalRows, setFractionalRows] = useState<Set<number>>(
    () =>
      new Set(
        review.orders.flatMap((order, index) =>
          Number.isInteger(order.deltaShares) ? [] : [index],
        ),
      ),
  );
  const seenTickers = new Set<string>();
  const duplicateTickers = new Set<string>();
  for (const order of review.orders) {
    if (!order.ticker) continue;
    if (seenTickers.has(order.ticker)) duplicateTickers.add(order.ticker);
    seenTickers.add(order.ticker);
  }
  const hasInvalidOrder = review.orders.some(
    (order) =>
      !/^[A-Z][A-Z0-9.-]{0,9}$/.test(order.ticker) ||
      !holdings.some((holding) => holding.ticker === order.ticker) ||
      !(order.deltaShares > 0) ||
      !(order.fillPrice > 0) ||
      order.sharesAfter < 0 ||
      (order.side === "sell" && order.deltaShares > order.sharesBefore),
  ) || duplicateTickers.size > 0;

  function updateOrder(
    index: number,
    update: (order: PendingQtyOrder) => PendingQtyOrder,
  ) {
    onChange({
      ...review,
      orders: review.orders.map((order, rowIndex) =>
        rowIndex === index ? update(order) : order,
      ),
    });
  }

  function updateOrderTicker(index: number, ticker: string) {
    setQuantityDrafts((current) => {
      const next = { ...current };
      delete next[`${index}:delta`];
      delete next[`${index}:total`];
      return next;
    });
    const holding = holdings.find((item) => item.ticker === ticker);
    const sharesBefore = holding?.shares ?? 0;
    updateOrder(index, (row) => ({
      ...row,
      ticker,
      sharesBefore,
      sharesAfter:
        row.side === "buy"
          ? roundQuantity(sharesBefore + row.deltaShares)
          : roundQuantity(Math.max(0, sharesBefore - row.deltaShares)),
      fillPrice: roundMoney(getMarkPrice(ticker) || row.fillPrice),
    }));
  }

  function commitOrderTicker(index: number, ticker: string) {
    const normalized = ticker.trim().toUpperCase();
    const order = review.orders[index];
    if (!order || !normalized) return;
    const exists = holdings.some((holding) => holding.ticker === normalized);
    if (!exists && order.side === "sell") {
      setTickerErrors((current) => ({
        ...current,
        [index]: "Sell orders require a ticker already in Current Watch.",
      }));
      return;
    }
    if (!exists) {
      const result = onAddTicker(normalized);
      if (result === "no-data" || result === "budget") {
        setTickerErrors((current) => ({
          ...current,
          [index]:
            result === "budget"
              ? `Ticker limit reached. Remove a name before adding ${normalized}.`
              : `No market data was found for ${normalized}.`,
        }));
        return;
      }
    }
    setTickerErrors((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    updateOrderTicker(index, normalized);
  }

  return (
    <ForgeTableModal
      title={
        review.isBatch
          ? "Simulate batch transactions"
          : "Review simulated changes"
      }
      titleId="qty-order-review-title"
      onCancel={() => {
        // Block X/backdrop dismiss while Confirm is committing — Discard must
        // not race a durable apply.
        if (submitting) return;
        onCancel();
      }}
      onDone={() => {
        if (submitting) return;
        setSubmitting(true);
        void Promise.resolve(onConfirm()).finally(() => setSubmitting(false));
      }}
      doneLabel={submitting ? "Saving…" : "Confirm"}
      doneDisabled={submitting || (review.orders.length === 0 && !review.cash) || hasInvalidOrder}
      intro="Set the date and time for each simulated buy, sell, deposit, or withdrawal. Adjust fill prices before confirming."
      stableTabs={review.isBatch}
      stableTabsTableMin={240}
      addAction={
        <div className="watch-order-add-actions">
          <button type="button" className="btn btn--small watch-order-action watch-order-action--buy" onClick={() => onAdd("buy")}>
            Buy
          </button>
          <button type="button" className="btn btn--small watch-order-action watch-order-action--sell" onClick={() => onAdd("sell")}>
            Sell
          </button>
        </div>
      }
    >
      <div className="forge-table watch-qty-order-table" role="table">
        {review.isBatch ? (
          <p className="watch-order-helper">
            Buy can add a new ticker to Current Watch. Sell is limited to current holdings.
          </p>
        ) : null}
        {review.orders.map((order, index) => (
          <div
            key={index}
            className="forge-table-row watch-qty-order-row"
            role="row"
          >
            <div className="forge-table-cell forge-table-cell--order" role="cell">
              <span className="watch-field-label">
                {order.side === "buy" ? "Simulated Buy Order" : "Simulated Sell Order"}
              </span>
              <div className="watch-order-ticker-row">
                <div className="watch-order-ticker-search">
                  <TickerSearch
                    id={`watch-order-ticker-${index}`}
                    label={`${order.side === "buy" ? "Buy" : "Sell"} order ticker`}
                    value={order.ticker}
                    maxLength={10}
                    suggestions={tickerOptions.filter((option) => {
                      const query = order.ticker.trim().toUpperCase();
                      return (
                        query.length === 0 ||
                        option.ticker.includes(query) ||
                        option.name.toUpperCase().includes(query)
                      );
                    }).map((option) => ({ symbol: option.ticker, name: option.name }))}
                    search={order.side === "buy" ? searchTickers : undefined}
                    onValueChange={(ticker) => {
                      setTickerErrors((current) => {
                        const next = { ...current };
                        delete next[index];
                        return next;
                      });
                      updateOrderTicker(index, ticker);
                    }}
                    onSelect={(ticker) => commitOrderTicker(index, ticker)}
                    onSubmit={(ticker) => commitOrderTicker(index, ticker)}
                  />
                </div>
              </div>
            </div>
            <label className="forge-table-cell" role="cell">
              <span className="watch-field-label">Qty {order.side === "buy" ? "bought" : "sold"}</span>
              <input
                key={fractionalRows.has(index) ? "fractional" : "whole"}
                type="number"
                className="input watch-qty-input"
                min={fractionalRows.has(index) ? 0.000001 : 1}
                step={fractionalRows.has(index) ? 0.000001 : 1}
                value={
                  fractionalRows.has(index)
                    ? quantityDrafts[`${index}:delta`] ??
                      formatFractionalQuantityInput(order.deltaShares)
                    : order.deltaShares
                }
                onChange={(event) => {
                  if (fractionalRows.has(index)) {
                    setQuantityDrafts((current) => ({
                      ...current,
                      [`${index}:delta`]: event.target.value,
                    }));
                  }
                  const parsed = Number(event.target.value);
                  const next = fractionalRows.has(index)
                    ? roundQuantity(parsed)
                    : Math.floor(parsed);
                  if (!Number.isFinite(next) || next <= 0) return;
                  updateOrder(index, (row) => ({
                    ...row,
                    deltaShares: next,
                    sharesAfter:
                      row.side === "buy"
                        ? roundQuantity(row.sharesBefore + next)
                        : roundQuantity(Math.max(0, row.sharesBefore - next)),
                  }));
                }}
                onBlur={() =>
                  setQuantityDrafts((current) => {
                    const next = { ...current };
                    delete next[`${index}:delta`];
                    return next;
                  })
                }
              />
            </label>
            <label className="forge-table-cell" role="cell">
              <span className="watch-field-label">Total qty</span>
              <input
                key={fractionalRows.has(index) ? "fractional" : "whole"}
                type="number"
                className="input watch-qty-input"
                min={0}
                step={fractionalRows.has(index) ? 0.000001 : 1}
                value={
                  fractionalRows.has(index)
                    ? quantityDrafts[`${index}:total`] ??
                      formatFractionalQuantityInput(order.sharesAfter)
                    : order.sharesAfter
                }
                onChange={(event) => {
                  if (fractionalRows.has(index)) {
                    setQuantityDrafts((current) => ({
                      ...current,
                      [`${index}:total`]: event.target.value,
                    }));
                  }
                  const parsed = Number(event.target.value);
                  const after = fractionalRows.has(index)
                    ? roundQuantity(parsed)
                    : Math.floor(parsed);
                  if (!Number.isFinite(after) || after < 0) return;
                  const delta = after - order.sharesBefore;
                  const side = qtySideFromDelta(delta);
                  if (!side) return;
                  updateOrder(index, (row) => ({
                    ...row,
                    side,
                    deltaShares: roundQuantity(Math.abs(delta)),
                    sharesAfter: after,
                  }));
                }}
                onBlur={() =>
                  setQuantityDrafts((current) => {
                    const next = { ...current };
                    delete next[`${index}:total`];
                    return next;
                  })
                }
              />
            </label>
            <label className="forge-table-cell" role="cell">
              <span className="watch-field-label">Fill price</span>
              <input
                type="number"
                className="input watch-qty-input"
                min={0}
                step={0.01}
                value={order.fillPrice}
                onChange={(event) => {
                  const price = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(price) || price < 0) return;
                  updateOrder(index, (row) => ({ ...row, fillPrice: roundMoney(price) }));
                }}
              />
            </label>
            <label className="forge-table-cell forge-table-cell--datetime" role="cell">
              <span className="watch-field-label">Date / time</span>
              <input
                type="datetime-local"
                className="input watch-qty-input watch-fill-datetime"
                value={toDatetimeLocalValue(order.filledAt)}
                onChange={(event) =>
                  updateOrder(index, (row) => ({
                    ...row,
                    filledAt: fromDatetimeLocalValue(event.target.value),
                  }))
                }
              />
            </label>
            <div
              className="forge-table-cell forge-table-cell--actions"
              role="cell"
              data-label="Actions"
            >
              <span className="watch-field-label">Actions</span>
              <div className="watch-order-row-actions">
                <FractionalSharesButton
                  fractional={fractionalRows.has(index)}
                  onToggle={() => {
                    setQuantityDrafts((current) => {
                      const next = { ...current };
                      delete next[`${index}:delta`];
                      delete next[`${index}:total`];
                      return next;
                    });
                    setFractionalRows((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    });
                  }}
                />
                <Tooltip desktopOnly body="Delete transaction">
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Remove ${order.ticker || "transaction"} row`}
                    onClick={() => {
                      setTickerErrors({});
                      setQuantityDrafts({});
                      setFractionalRows((current) =>
                        new Set(
                          [...current]
                            .filter((rowIndex) => rowIndex !== index)
                            .map((rowIndex) =>
                              rowIndex > index ? rowIndex - 1 : rowIndex,
                            ),
                        ),
                      );
                      onChange({
                        ...review,
                        orders: review.orders.filter(
                          (_, rowIndex) => rowIndex !== index,
                        ),
                      });
                    }}
                  >
                    <Trash aria-hidden weight="regular" />
                  </button>
                </Tooltip>
              </div>
            </div>
            {(Boolean(order.ticker) &&
              review.orders.findIndex(
                (candidate) => candidate.ticker === order.ticker,
              ) < index) ||
            Boolean(tickerErrors[index]) ? (
              <div
                className="forge-table-cell watch-order-row-messages"
                role="cell"
              >
                {order.ticker &&
                review.orders.findIndex(
                  (candidate) => candidate.ticker === order.ticker,
                ) < index ? (
                  <RowMessage tone="error" className="watch-order-row-error">
                    One row per ticker. Split {order.ticker} into a later Update
                    if you need another transaction.
                  </RowMessage>
                ) : null}
                {tickerErrors[index] ? (
                  <RowMessage tone="error" className="watch-order-row-error">
                    {tickerErrors[index]}
                  </RowMessage>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        {review.cash ? (
          <div className="forge-table-row watch-qty-order-row" role="row">
            <div className="forge-table-cell forge-table-cell--order" role="cell">
              <span className="watch-field-label">
                {review.cash.side === "deposit" ? "Simulated Cash Deposit" : "Simulated Cash Withdrawal"}
              </span>
              <span className="watch-figure watch-figure--strong">Cash</span>
            </div>
            <div className="forge-table-cell" role="cell">
              <span className="watch-field-label">Amount</span>
              <span className="watch-figure watch-figure--strong">{formatPrice(Math.abs(review.cash.deltaCash))}</span>
            </div>
            <div className="forge-table-cell" role="cell">
              <span className="watch-field-label">Before</span>
              <span className="watch-figure">{formatPrice(review.cash.cashBefore)}</span>
            </div>
            <div className="forge-table-cell" role="cell">
              <span className="watch-field-label">After</span>
              <span className="watch-figure">{formatPrice(review.cash.cashAfter)}</span>
            </div>
            <label className="forge-table-cell forge-table-cell--datetime" role="cell">
              <span className="watch-field-label">Date / time</span>
              <input
                type="datetime-local"
                className="input watch-qty-input watch-fill-datetime"
                value={toDatetimeLocalValue(review.cash.filledAt)}
                onChange={(event) =>
                  onChange({
                    ...review,
                    cash: review.cash
                      ? { ...review.cash, filledAt: fromDatetimeLocalValue(event.target.value) }
                      : null,
                  })
                }
              />
            </label>
            <div
              className="forge-table-cell forge-table-cell--actions"
              role="cell"
              aria-hidden="true"
            >
              <span className="watch-field-label">Actions</span>
            </div>
          </div>
        ) : null}
      </div>
    </ForgeTableModal>
  );
}
