import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "../../lib/icons";

const DEFAULT_DONE_ICON = <Plus aria-hidden weight="regular" />;

/**
 * Shared chrome for Strategy Forge table modals (Rule Chips, Tags, Layer 3
 * zones, …) and any other full-viewport editor that needs the same shell
 * (e.g. Current Watch add-ticker confirm).
 *
 * Owns the backdrop, card, title bar, intro + add-action row, weight total,
 * caution, and Cancel/Update footer — the pieces that must look and behave
 * identically across viewports. Domain tables / pickers render as `children`
 * or `alternateView` (e.g. the chip-library picker).
 *
 * Portaled to `document.body` so ancestors with `overflow` / `transform`
 * (Home Embla slides, card scroll regions) cannot clip or re-contain
 * `position: fixed`. Same pattern as ComingSoonOverlay / Tooltip.
 *
 * Do not restyle this shell per-modal. Put modal-specific UI in the slots.
 */
export function ForgeTableModal({
  title,
  titleId,
  titleAccessory,
  withPlan = false,
  stableTabs = false,
  stableTabsTableMin,
  onCancel,
  onDone,
  doneLabel = "Update",
  doneDisabled = false,
  doneIcon,
  intro,
  addAction,
  totalLabel,
  totalValue,
  totalWarn = false,
  caution,
  actionBar,
  alternateView = null,
  children,
}: {
  title: ReactNode;
  titleId: string;
  /** Optional tip / badge rendered inside the title row (after the title text). */
  titleAccessory?: ReactNode;
  /** Wider card when the table includes a My Plan column. */
  withPlan?: boolean;
  /**
   * Desktop/tablet (≥768px): lock card height so in-modal section tabs
   * (Thesis · Technical · Market) don't resize the shell when switching.
   * Mobile stays a full-screen sheet (already stable).
   */
  stableTabs?: boolean;
  /**
   * Pixel min-height for the table body (tallest lens). Used with
   * `stableTabs` to size the card to that lens, capped at 90vh.
   */
  stableTabsTableMin?: number;
  onCancel: () => void;
  onDone: () => void;
  /** Primary footer button label (default: Update). */
  doneLabel?: string;
  /** Prevent final submission while a review flow still has blocking issues. */
  doneDisabled?: boolean;
  /**
   * Icon before the primary Done label. Defaults to Plus. Pass `null` for
   * no icon (e.g. Finish / Close on import).
   */
  doneIcon?: ReactNode;
  /** Short intro line (left side of the intro row). */
  intro?: ReactNode;
  /** Primary add control (right side of the intro row) — button or ActionMenu. */
  addAction?: ReactNode;
  totalLabel?: string;
  totalValue?: ReactNode;
  totalWarn?: boolean;
  caution?: ReactNode;
  /**
   * Optional secondary action strip pinned above Cancel / primary Done
   * (e.g. import Confirm Edits + Exclude All Flagged). Keep chrome shared —
   * put modal-specific buttons in this slot, not a parallel footer.
   */
  actionBar?: ReactNode;
  /**
   * When set, replaces the intro / table / footer (e.g. "Add from library"
   * picker). Title bar stays so Cancel via X / backdrop still works.
   */
  alternateView?: ReactNode | null;
  /** Main table (and any in-flow extras below it, before the total row). */
  children?: ReactNode;
}) {
  if (typeof document === "undefined") return null;

  const cardClass = [
    "modal-card",
    "panel",
    "forge-table-modal",
    withPlan ? "forge-table-modal--with-plan" : null,
    stableTabs ? "forge-table-modal--stable-tabs" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const cardStyle: CSSProperties | undefined =
    stableTabs && stableTabsTableMin != null
      ? ({
          ["--forge-lens-table-min"]: `${stableTabsTableMin}px`,
        } as CSSProperties)
      : undefined;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={cardClass}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forge-table-head">
          <h2 id={titleId}>
            {title}
            {titleAccessory}
          </h2>
          <button
            type="button"
            className="forge-table-close"
            onClick={onCancel}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>

        {alternateView ? (
          alternateView
        ) : (
          <>
            {intro != null || addAction != null ? (
              <div className="forge-table-intro">
                {intro != null ? <p>{intro}</p> : <p />}
                {addAction}
              </div>
            ) : null}

            {children}

            {totalLabel != null ? (
              <div
                className={
                  totalWarn
                    ? "forge-table-total forge-table-total--warn"
                    : "forge-table-total"
                }
              >
                <span>{totalLabel}</span>
                <span className="forge-table-total-val">{totalValue}</span>
              </div>
            ) : null}
            {caution}

            {actionBar != null ? (
              <div className="forge-table-action-bar">{actionBar}</div>
            ) : null}

            <div className="forge-table-actions">
              <button
                type="button"
                className="btn btn--small btn--link forge-cancel-btn"
                onClick={onCancel}
              >
                <X aria-hidden weight="bold" /> Cancel
              </button>
              <button
                type="button"
                className="btn btn--small btn--solid"
                onClick={onDone}
                disabled={doneDisabled}
              >
                {doneIcon === undefined ? DEFAULT_DONE_ICON : doneIcon}
                {doneLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
