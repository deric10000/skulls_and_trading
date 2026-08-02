import { useState } from "react";
import {
  formatFractionalQuantityInput,
  formatQuantity,
  roundQuantity,
  roundUsd,
  type DraftPortfolioTransaction,
  type OversellResolution,
  type TransactionIssue,
} from "../../lib/finance/currentWatchTransactions";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "../../lib/finance/timestamps";
import { Trash } from "../../lib/icons";
import { Radio } from "../Radio";
import { Tooltip } from "../Tooltip";
import { RowMessage } from "../RowMessage";

export type PendingOversellChoice = {
  resolution: OversellResolution;
  heldShares: number;
  sharesAfter?: number;
};

function typeLabel(type: DraftPortfolioTransaction["type"]): string {
  switch (type) {
    case "buy":
      return "Imported Buy";
    case "sell":
      return "Imported Sell";
    case "deposit":
      return "Imported Deposit";
    case "withdrawal":
      return "Imported Withdrawal";
  }
}

export function isPendingOversellComplete(
  pending: PendingOversellChoice,
): boolean {
  if (pending.resolution === "close-to-zero") return true;
  const sharesAfter = pending.sharesAfter;
  if (sharesAfter == null || !Number.isFinite(sharesAfter) || sharesAfter < 0) {
    return false;
  }
  if (pending.heldShares > 0 && sharesAfter >= pending.heldShares) {
    return false;
  }
  return true;
}

/**
 * Confirm Edits stays disabled until every remaining flagged replay issue is
 * an oversell with a complete pending radio choice (or the row was removed so
 * it is no longer in `issues`). Non-oversell flags and other import blockers
 * keep Confirm disabled — fix/exclude those separately.
 */
export function canConfirmFlaggedImportEdits(
  issues: TransactionIssue[],
  pendingById: Record<string, PendingOversellChoice>,
  hasOtherImportFlags: boolean,
): boolean {
  if (hasOtherImportFlags || issues.length === 0) return false;
  return issues.every((issue) => {
    if (issue.code !== "oversell") return false;
    const pending = pendingById[issue.transactionId];
    return pending != null && isPendingOversellComplete(pending);
  });
}

export function ImportFlaggedRowsEditor({
  transactions,
  issues,
  canSuggestPreserveCash,
  pendingOversellById,
  onPendingOversellChange,
  onChange,
  onExclude,
  onSwitchToPreserveCash,
}: {
  transactions: DraftPortfolioTransaction[];
  issues: TransactionIssue[];
  /** Append + apply-cash mode: buys can suggest Keep current cash balance. */
  canSuggestPreserveCash: boolean;
  /** Uncommitted oversell radio choices — applied only via Confirm Edits. */
  pendingOversellById: Record<string, PendingOversellChoice>;
  onPendingOversellChange: (
    transactionId: string,
    pending: PendingOversellChoice | null,
  ) => void;
  onChange: (
    transactionId: string,
    patch: Partial<DraftPortfolioTransaction>,
  ) => void;
  onExclude: (transactionId: string) => void;
  onSwitchToPreserveCash: () => void;
}) {
  const issuesById = new Map(issues.map((issue) => [issue.transactionId, issue]));
  const flagged = transactions.filter((row) => issuesById.has(row.id));
  const [qtyLeftDrafts, setQtyLeftDrafts] = useState<Record<string, string>>({});
  if (flagged.length === 0) return null;

  return (
    <div className="forge-table watch-qty-order-table watch-import-flagged-table" role="table">
      <p className="watch-order-helper">
        Fix flagged rows here — edits stay on this device until you import. The
        CSV file is never changed.
      </p>
      {flagged.map((row) => {
        const issue = issuesById.get(row.id);
        if (!issue) return null;
        const isCash = row.type === "deposit" || row.type === "withdrawal";
        const held = issue.availableShares ?? 0;
        const needsOversellChoice =
          issue.code === "oversell" && row.type === "sell";
        const pending = pendingOversellById[row.id];
        const resolution = pending?.resolution ?? row.oversellResolution;
        const qtyLeftValue =
          qtyLeftDrafts[row.id] ??
          (pending?.sharesAfter != null
            ? formatFractionalQuantityInput(pending.sharesAfter)
            : row.targetSharesAfter != null
              ? formatFractionalQuantityInput(row.targetSharesAfter)
              : "");
        const qtyLeftMax =
          held > 0 ? Math.max(0, held - 0.000001) : undefined;
        return (
          <div
            key={row.id}
            className="forge-table-row watch-qty-order-row"
            role="row"
          >
            <div className="forge-table-cell forge-table-cell--order" role="cell">
              <span className="watch-field-label">
                Row {row.sourceRow ?? "—"} · {typeLabel(row.type)}
              </span>
              {isCash ? (
                <span className="watch-figure watch-figure--strong">Cash</span>
              ) : (
                <label className="watch-import-inline-field">
                  <span className="visually-hidden">Ticker</span>
                  <input
                    type="text"
                    className="input watch-qty-input"
                    maxLength={10}
                    value={row.ticker ?? ""}
                    onChange={(event) =>
                      onChange(row.id, {
                        ticker: event.target.value.trim().toUpperCase(),
                        oversellResolution: undefined,
                        targetSharesAfter: undefined,
                        oversellPolicy: undefined,
                      })
                    }
                  />
                </label>
              )}
            </div>
            {isCash ? (
              <label className="forge-table-cell" role="cell">
                <span className="watch-field-label">Amount</span>
                <input
                  type="number"
                  className="input watch-qty-input"
                  min={0.01}
                  step={0.01}
                  value={row.amount ?? ""}
                  onChange={(event) => {
                    const amount = roundUsd(Number(event.target.value));
                    if (!Number.isFinite(amount) || amount < 0) return;
                    onChange(row.id, { amount });
                  }}
                />
              </label>
            ) : (
              <>
                <label className="forge-table-cell" role="cell">
                  <span className="watch-field-label">
                    Qty {row.type === "buy" ? "bought" : "sold"}
                  </span>
                  <input
                    type="number"
                    className="input watch-qty-input"
                    min={0.000001}
                    step={0.000001}
                    value={
                      row.quantity == null
                        ? ""
                        : formatFractionalQuantityInput(row.quantity)
                    }
                    onChange={(event) => {
                      const next = roundQuantity(Number(event.target.value));
                      if (!Number.isFinite(next) || next <= 0) return;
                      onChange(row.id, {
                        quantity: next,
                        oversellPolicy: undefined,
                        oversellResolution: undefined,
                        targetSharesAfter: undefined,
                      });
                    }}
                  />
                </label>
                <label className="forge-table-cell" role="cell">
                  <span className="watch-field-label">Fill price</span>
                  <input
                    type="number"
                    className="input watch-qty-input"
                    min={0.01}
                    step={0.01}
                    value={row.fillPrice ?? ""}
                    onChange={(event) => {
                      const price = roundUsd(Number(event.target.value));
                      if (!Number.isFinite(price) || price <= 0) return;
                      onChange(row.id, { fillPrice: price });
                    }}
                  />
                </label>
              </>
            )}
            <label
              className="forge-table-cell forge-table-cell--datetime"
              role="cell"
            >
              <span className="watch-field-label">Date / time</span>
              <input
                type="datetime-local"
                className="input watch-qty-input watch-fill-datetime"
                value={toDatetimeLocalValue(row.filledAt)}
                onChange={(event) =>
                  onChange(row.id, {
                    filledAt: fromDatetimeLocalValue(event.target.value),
                  })
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
                <Tooltip desktopOnly body="Exclude this row from the import">
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Exclude row ${row.sourceRow ?? ""}`}
                    onClick={() => onExclude(row.id)}
                  >
                    <Trash aria-hidden weight="regular" />
                  </button>
                </Tooltip>
              </div>
            </div>
            <div
              className="forge-table-cell watch-order-row-messages"
              role="cell"
            >
              <RowMessage tone="error" className="watch-order-row-error">
                {issue.message}
              </RowMessage>
              {issue.code === "insufficient-cash" && canSuggestPreserveCash ? (
                <>
                  <RowMessage tone="warning" className="watch-order-row-error">
                    If this cash lived in your brokerage but is not in this
                    portfolio timeline, switch to Keep current cash balance so
                    buys update holdings without requiring a deposit first.
                    Deposits and withdrawals still change cash.
                  </RowMessage>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={onSwitchToPreserveCash}
                  >
                    Use Keep current cash balance
                  </button>
                </>
              ) : null}
              {needsOversellChoice ? (
                <div
                  className="watch-import-radio-list watch-import-oversell-choice"
                  role="radiogroup"
                  aria-label={`Resolve oversell for row ${row.sourceRow ?? ""}`}
                >
                  <RowMessage tone="warning" className="watch-order-row-error">
                    {held > 0
                      ? `This portfolio accounts for ${formatQuantity(held)} ${issue.ticker} before this sell. Select how to resolve the oversell, then Confirm Edits — or exclude the row. Import stays blocked until you confirm or exclude.`
                      : `This portfolio shows 0 ${issue.ticker} before this sell (common when brokerage shares were never imported). Select how to resolve it, then Confirm Edits — or exclude the row. Import stays blocked until you confirm or exclude.`}
                  </RowMessage>
                  <button
                    type="button"
                    className="watch-import-radio-row"
                    role="radio"
                    aria-checked={resolution === "close-to-zero"}
                    onClick={() =>
                      onPendingOversellChange(row.id, {
                        resolution: "close-to-zero",
                        heldShares: held,
                        sharesAfter: 0,
                      })
                    }
                  >
                    <Radio decorative checked={resolution === "close-to-zero"} />
                    <span>
                      <strong>
                        {held > 0
                          ? `Sell ${formatQuantity(held)} ${issue.ticker} and leave 0 shares`
                          : `Leave 0 ${issue.ticker} shares after this sell`}
                      </strong>
                      <small>
                        {held > 0
                          ? "Closes the accounted position only."
                          : "Records this brokerage sell as closing an untracked lot, ending at 0 in this portfolio."}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="watch-import-radio-row"
                    role="radio"
                    aria-checked={resolution === "set-qty-left"}
                    onClick={() => {
                      onPendingOversellChange(row.id, {
                        resolution: "set-qty-left",
                        heldShares: held,
                        sharesAfter:
                          pending?.sharesAfter ?? row.targetSharesAfter,
                      });
                    }}
                  >
                    <Radio decorative checked={resolution === "set-qty-left"} />
                    <span>
                      <strong>Set total qty left after this sell</strong>
                      <small>
                        {held > 0
                          ? `Must be less than the ${formatQuantity(held)} ${issue.ticker} currently accounted for.`
                          : `Enter how many ${issue.ticker} should remain in this portfolio after importing the sell.`}
                      </small>
                    </span>
                  </button>
                  {resolution === "set-qty-left" ? (
                    <label className="watch-import-qty-left">
                      <span className="watch-field-label">Total qty left</span>
                      <input
                        type="number"
                        className="input watch-qty-input"
                        min={0}
                        max={qtyLeftMax}
                        step={0.000001}
                        value={qtyLeftValue}
                        onChange={(event) => {
                          const raw = event.target.value;
                          setQtyLeftDrafts((current) => ({
                            ...current,
                            [row.id]: raw,
                          }));
                          const sharesAfter = roundQuantity(Number(raw));
                          if (!Number.isFinite(sharesAfter) || sharesAfter < 0) {
                            onPendingOversellChange(row.id, {
                              resolution: "set-qty-left",
                              heldShares: held,
                              sharesAfter: undefined,
                            });
                            return;
                          }
                          if (held > 0 && sharesAfter >= held) {
                            onPendingOversellChange(row.id, {
                              resolution: "set-qty-left",
                              heldShares: held,
                              sharesAfter: undefined,
                            });
                            return;
                          }
                          onPendingOversellChange(row.id, {
                            resolution: "set-qty-left",
                            heldShares: held,
                            sharesAfter,
                          });
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
