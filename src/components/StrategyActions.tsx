import { Copy, PencilSimple, Plus, Trash } from "../lib/icons";
import { useStackedRow } from "../lib/useStackedRow";

/**
 * The Delete / Duplicate / Add action row for the strategy list. Reused in two
 * spots: inside the list card (desktop/tablet) and as a viewport-sticky dock at
 * the bottom of the page on mobile. On desktop the buttons stack full-width when
 * they'd collide (measured via ResizeObserver); on mobile they render as
 * icon-only squares (CSS) so the observer's stacking is a no-op there.
 */
export function StrategyActions({
  selectedId,
  canDelete,
  onDelete,
  onDuplicate,
  onCreate,
  onEdit,
  className,
}: {
  selectedId: string;
  canDelete: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onCreate: () => void;
  /** When provided, renders an Edit button (left of Duplicate). Used by the
      mobile dock, where selecting a strategy then tapping Edit opens Configure.
      Omitted on desktop/tablet, where the config panel is always in view. */
  onEdit?: () => void;
  className?: string;
}) {
  const { ref: footerRef, stacked } = useStackedRow<HTMLDivElement>();

  return (
    <div
      className={["strategy-footer", stacked ? "is-stacked" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      ref={footerRef}
    >
      <button
        type="button"
        className="btn btn--small btn--danger"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Delete strategy"
      >
        <Trash size={16} weight="regular" aria-hidden />
        <span className="btn-label">Delete</span>
      </button>
      {onEdit && (
        <button
          type="button"
          className="btn btn--small"
          onClick={onEdit}
          disabled={!selectedId}
          aria-label="Edit strategy"
        >
          <PencilSimple size={16} weight="regular" aria-hidden />
          <span className="btn-label">Edit</span>
        </button>
      )}
      <button
        type="button"
        className="btn btn--small"
        onClick={onDuplicate}
        disabled={!selectedId}
        aria-label="Duplicate strategy"
      >
        <Copy size={16} weight="regular" aria-hidden />
        <span className="btn-label">Duplicate</span>
      </button>
      <button
        type="button"
        className="btn btn--small btn--solid"
        onClick={onCreate}
        aria-label="Add strategy"
      >
        <Plus size={16} weight="regular" aria-hidden />
        <span className="btn-label">Add</span>
      </button>
    </div>
  );
}
