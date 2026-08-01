import { useEffect, useState } from "react";
import { ForgeTableModal } from "../forge/ForgeTableModal";
import { ForgeToast } from "../forge/ForgeToast";

export type TickerRemovalChoice = "sell" | "untrack" | "history";

export function CurrentWatchArchivedSourceActions({
  archiveLabel,
  busy,
  onRestore,
  onDelete,
}: {
  archiveLabel: string;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="watch-archive-actions">
      <div>
        <span className="config-label forge-label">Archived portfolio</span>
        <p>{archiveLabel}. This source is read-only and excluded from scoring, Helm, Forge, and Market Weather checks.</p>
      </div>
      <div className="watch-archive-action-buttons">
        <button type="button" className="btn btn--small btn--solid" disabled={busy} onClick={onRestore}>
          Restore
        </button>
        <button type="button" className="btn btn--small btn--link" disabled={busy} onClick={onDelete}>
          Delete Permanently
        </button>
      </div>
    </div>
  );
}

export function CurrentWatchTickerHistoryRecovery({
  recoveries,
  onDismiss,
  onRestore,
}: {
  recoveries: Array<{ ticker: string; archiveId: number; purgeAt: string }>;
  onDismiss: (archiveId: number) => void;
  onRestore: (archiveId: number) => void;
}) {
  return (
    <div className="forge-toast-stack">
      {recoveries.map((recovery) => (
        <ForgeToast key={recovery.archiveId} tone="warning" onDismiss={() => onDismiss(recovery.archiveId)}>
          <p>{recovery.ticker} history is archived for 30 days.</p>
          <button type="button" className="btn btn--small btn--link" onClick={() => onRestore(recovery.archiveId)}>
            Undo history removal
          </button>
        </ForgeToast>
      ))}
    </div>
  );
}

export function CurrentWatchRecoveryModals({
  sourceLabel,
  removeTicker,
  archiveOpen,
  permanentDeleteOpen,
  busy,
  onCloseTicker,
  onApplyTicker,
  onCloseArchive,
  onArchive,
  onClosePermanentDelete,
  onPermanentDelete,
}: {
  sourceLabel: string;
  removeTicker: string | null;
  archiveOpen: boolean;
  permanentDeleteOpen: boolean;
  busy: boolean;
  onCloseTicker: () => void;
  onApplyTicker: (choice: TickerRemovalChoice) => void;
  onCloseArchive: () => void;
  onArchive: () => void;
  onClosePermanentDelete: () => void;
  onPermanentDelete: () => void;
}) {
  const [tickerChoice, setTickerChoice] = useState<TickerRemovalChoice | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);

  useEffect(() => {
    setTickerChoice(null);
  }, [removeTicker]);

  useEffect(() => {
    setDeleteStep(1);
  }, [permanentDeleteOpen]);

  return (
    <>
      {removeTicker ? (
        <ForgeTableModal
          title={`Remove ${removeTicker}?`}
          titleId="watch-remove-ticker-title"
          onCancel={onCloseTicker}
          onDone={() => tickerChoice && onApplyTicker(tickerChoice)}
          doneLabel="Apply"
          doneDisabled={!tickerChoice}
          intro="Choose what this edit should do. Nothing is finalized until you select Update."
        >
          <div className="watch-source-type-picker" role="radiogroup" aria-label="Ticker removal action">
            {([
              ["sell", "Simulate sell all", "Set quantity to zero, record a simulated sale, and add the proceeds to cash."],
              ["untrack", "Remove from tracking", "Remove the ticker while keeping its transaction history."],
              ["history", "Remove tracking and history", "Very destructive. Stage the ticker and its history for removal; history remains recoverable for 30 days after Update."],
            ] as const).map(([value, title, copy]) => (
              <button
                key={value}
                type="button"
                className={tickerChoice === value ? "select-card watch-source-type-option is-selected" : "select-card watch-source-type-option"}
                role="radio"
                aria-checked={tickerChoice === value}
                onClick={() => setTickerChoice(value)}
              >
                <span className="watch-source-type-title">{title}</span>
                <span className="watch-source-type-copy">{copy}</span>
              </button>
            ))}
          </div>
        </ForgeTableModal>
      ) : null}
      {archiveOpen ? (
        <ForgeTableModal
          title={`Remove ${sourceLabel}?`}
          titleId="watch-archive-source-title"
          onCancel={onCloseArchive}
          onDone={onArchive}
          doneLabel={busy ? "Removing…" : "Remove from tracking"}
          doneDisabled={busy}
          intro="This removes the portfolio from active tracking and scoring. Its holdings and history remain recoverable for 30 days."
          caution="Nothing is permanently deleted in this step."
        />
      ) : null}
      {permanentDeleteOpen ? (
        <ForgeTableModal
          title={deleteStep === 1 ? "Permanently delete this archive?" : "Final confirmation"}
          titleId="watch-delete-archive-title"
          onCancel={onClosePermanentDelete}
          onDone={() => {
            if (deleteStep === 1) setDeleteStep(2);
            else onPermanentDelete();
          }}
          doneLabel={deleteStep === 1 ? "Continue" : busy ? "Deleting…" : "Delete Permanently"}
          doneDisabled={busy}
          intro={
            deleteStep === 1
              ? "This removes the archived portfolio and its retained transaction history. This cannot be undone."
              : `Delete ${sourceLabel} and its archived history now? There is no recovery after this confirmation.`
          }
        />
      ) : null}
    </>
  );
}
