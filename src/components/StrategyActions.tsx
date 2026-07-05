import { useLayoutEffect, useRef, useState } from "react";
import { Copy, PencilSimple, Plus, Trash } from "../lib/icons";

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
  const footerRef = useRef<HTMLDivElement>(null);
  const stackedRef = useRef(false);
  const requiredWidthRef = useRef(0);
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const measure = () => {
      const buttons = footer.querySelectorAll<HTMLElement>(".btn");
      // Only re-measure the natural row width while we're in the row layout —
      // once stacked, the buttons are full-width and would report the wrong size.
      if (!stackedRef.current) {
        const gap = 8; // 0.5rem flex gap
        let total = 0;
        buttons.forEach((button) => {
          total += button.offsetWidth;
        });
        requiredWidthRef.current = total + gap * Math.max(0, buttons.length - 1);
      }
      const shouldStack =
        requiredWidthRef.current > 0 &&
        footer.clientWidth < requiredWidthRef.current;
      stackedRef.current = shouldStack;
      setStacked(shouldStack);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

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
