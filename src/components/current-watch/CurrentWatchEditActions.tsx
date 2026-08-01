import { FileArrowUp, ListBullets, Trash } from "../../lib/icons";
import { Tooltip } from "../Tooltip";

export function CurrentWatchEmptyActions({
  isWatchlist,
  onDeposit,
  onTicker,
}: {
  isWatchlist: boolean;
  onDeposit: () => void;
  onTicker: () => void;
}) {
  return (
    <div className="watch-empty-actions" aria-label="Start this source">
      {!isWatchlist ? (
        <button type="button" className="btn btn--small btn--ghost" onClick={onDeposit}>
          Add Initial Deposit
        </button>
      ) : null}
      <button type="button" className="btn btn--small btn--ghost" onClick={onTicker}>
        Add First Ticker
      </button>
    </div>
  );
}

export function CurrentWatchEditToolbar({
  isWatchlist,
  sourceLabel,
  onTransactions,
  onImport,
  onArchive,
  dirty,
  onBlocked,
}: {
  isWatchlist: boolean;
  sourceLabel: string;
  onTransactions: () => void;
  onImport: () => void;
  onArchive: () => void;
  dirty: boolean;
  onBlocked: (message: string) => void;
}) {
  return (
    <div className="watch-edit-toolbar" aria-label="Edit tools">
      {!isWatchlist ? (
        <>
          <Tooltip body="Batch Transactions" desktopOnly>
            <button type="button" className="icon-btn" aria-label="Batch Transactions" onClick={onTransactions}>
              <ListBullets aria-hidden weight="regular" />
            </button>
          </Tooltip>
          <Tooltip body="Import Transactions" desktopOnly>
            <button type="button" className="icon-btn" aria-label="Import Transactions" onClick={() => dirty ? onBlocked("Update or Cancel before importing transactions.") : onImport()}>
              <FileArrowUp aria-hidden weight="regular" />
            </button>
          </Tooltip>
        </>
      ) : null}
      <span className="watch-edit-toolbar-destructive-wrap">
        <Tooltip body={`Remove ${sourceLabel}`} desktopOnly>
          <button
            type="button"
            className="icon-btn icon-btn--danger watch-edit-toolbar-destructive"
            aria-label={`Remove ${sourceLabel}`}
            onClick={() => dirty ? onBlocked("Update or Cancel before removing this portfolio.") : onArchive()}
          >
            <Trash aria-hidden weight="regular" />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}
