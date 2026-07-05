import { useLayoutEffect, useRef, useState } from "react";
import type { Strategy } from "../types";
import { Copy, Plus, Trash } from "../lib/icons";
import { StrategyCard } from "./StrategyCard";

export function StrategyList({
  strategies,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: {
  strategies: Strategy[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const selected = strategies.find((strategy) => strategy.id === selectedId);

  // Stack the footer buttons full-width only when their natural row can't fit
  // (i.e. they would collide). Measuring the real widths keeps the row layout at
  // its original sizes until an actual collision, then flips to the stack.
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
        requiredWidthRef.current =
          total + gap * Math.max(0, buttons.length - 1);
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
    <section className="panel strategy-list-panel" aria-labelledby="strategy-list-title">
      <div className="panel-head">
        <h2 id="strategy-list-title">My Strategies</h2>
        <span className="panel-tag">{strategies.length} total</span>
      </div>
      <p className="panel-intro">Add, configure, and remove strategies below.</p>

      <ul className="strategy-list">
        {strategies.map((strategy) => (
          <li key={strategy.id}>
            <StrategyCard
              strategy={strategy}
              isActive={strategy.id === selectedId}
              onSelect={() => onSelect(strategy.id)}
            />
          </li>
        ))}
      </ul>

      <div
        className={stacked ? "strategy-footer is-stacked" : "strategy-footer"}
        ref={footerRef}
      >
        <button
          type="button"
          className="btn btn--small btn--danger"
          onClick={() => selectedId && onDelete(selectedId)}
          disabled={!selected || selected.isDefault}
          aria-label="Delete strategy"
        >
          <Trash size={16} weight="regular" aria-hidden />
          <span className="btn-label">Delete</span>
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => selectedId && onDuplicate(selectedId)}
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
    </section>
  );
}
