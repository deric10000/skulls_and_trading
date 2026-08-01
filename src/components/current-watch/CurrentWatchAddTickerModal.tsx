import type { ReactNode } from "react";
import type { WatchlistItem } from "../../types";
import { openPnlPercent, openPnlTotal } from "../../lib/finance/averageCost";
import { formatChange, formatPrice } from "../../lib/format";
import { NeedsDataReviewFlag } from "../NeedsDataReviewFlag";
import { ForgeTableModal } from "../forge/ForgeTableModal";

export function CurrentWatchAddTickerModal({
  item,
  markPrice,
  untrackedLabel,
  onCancel,
  onAdd,
}: {
  item: WatchlistItem;
  markPrice: number | null;
  untrackedLabel: ReactNode;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const owned = item.shares > 0;
  const price = markPrice ?? 0;
  const marketValue = price * item.shares;
  const totalPnl = openPnlTotal(price, item.avgPrice, item.shares);
  const changePct = openPnlPercent(price, item.avgPrice);
  const changeClass = changePct >= 0 ? "watch-change--up" : "watch-change--down";

  return (
    <ForgeTableModal
      title={`Add ${item.ticker}?`}
      titleId="watch-add-preview-title"
      onCancel={onCancel}
      onDone={onAdd}
      doneLabel="Add"
      intro="Preview how this name will appear on Current Watch."
    >
      <div className="forge-table watch-add-preview">
        <div className="watch-item select-card watch-item--preview">
          <div className="watch-select">
            <span className="watch-head">
              <span className="watch-id">
                <span className="watch-ticker">{item.ticker}</span>
                <span className="watch-name">{item.name}</span>
              </span>
              {owned ? (
                <span className="watch-mvqty">
                  <span className="watch-field-label">Market Value | Qty</span>
                  <span className="watch-figure watch-figure--strong">{formatPrice(marketValue)}</span>
                  <span className="watch-figure">{item.shares}</span>
                </span>
              ) : null}
            </span>
            <span className="watch-body">
              <span className="watch-metrics">
                {owned ? (
                  <span className="watch-metric-pair">
                    <span className="watch-metric">
                      <span className="watch-field-label">Last Price</span>
                      <span className="watch-figure watch-figure--strong">{markPrice == null ? <NeedsDataReviewFlag /> : formatPrice(price)}</span>
                    </span>
                    <span className="watch-metric">
                      <span className="watch-field-label">Avg. Price</span>
                      <span className="watch-figure">{formatPrice(item.avgPrice)}</span>
                    </span>
                  </span>
                ) : (
                  <span className="watch-metric">
                    <span className="watch-field-label">Last Price</span>
                    <span className="watch-figure watch-figure--strong">{markPrice == null ? <NeedsDataReviewFlag /> : formatPrice(price)}</span>
                  </span>
                )}
                {owned ? (
                  <span className="watch-metric">
                    <span className="watch-field-label">Open P&amp;L% | Total</span>
                    <span className="watch-pnl">
                      <span className={`watch-figure watch-figure--medium ${changeClass}`}>{formatChange(changePct)}</span>
                      <span className={`watch-figure ${changeClass}`}>{formatPrice(totalPnl)}</span>
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="watch-conviction-box">{untrackedLabel}</span>
            </span>
          </div>
        </div>
      </div>
    </ForgeTableModal>
  );
}
