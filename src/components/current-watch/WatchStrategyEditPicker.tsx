import { useEffect, useRef, useState } from "react";
import type { PortfolioHolding, Strategy } from "../../types";
import { isTickerEnabledForStrategy } from "../../lib/forge/tickerStrategy";
import { CaretDown } from "../../lib/icons";
import { Checkbox } from "../Checkbox";

/** Strategy assignment control loaded only after Current Watch enters Edit Mode. */
export function WatchStrategyEditPicker({
  ticker,
  portfolioId,
  strategies,
  holding,
  onToggle,
}: {
  ticker: string;
  portfolioId: string;
  strategies: Strategy[];
  holding: PortfolioHolding | undefined;
  onToggle: (strategyId: string, enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const enabledCount = strategies.filter((strategy) =>
    holding ? isTickerEnabledForStrategy(holding, strategy, portfolioId) : false,
  ).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={open ? "watch-strategy-edit is-open" : "watch-strategy-edit"} ref={rootRef}>
      <span className="watch-field-label">Strategies</span>
      <button
        type="button"
        className="input multiselect-trigger watch-strategy-edit-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Strategies for ${ticker}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="multiselect-value">
          {strategies.length === 0 ? (
            <span className="multiselect-placeholder">No strategies applied</span>
          ) : enabledCount > 0 ? (
            <span>{enabledCount} of {strategies.length} on</span>
          ) : (
            <span className="multiselect-placeholder">Select strategies…</span>
          )}
        </span>
        <CaretDown className="multiselect-caret" aria-hidden weight="regular" />
      </button>
      {open ? (
        <ul
          className="multiselect-menu portfolio-ticker-suggestions watch-strategy-edit-menu"
          role="listbox"
          aria-multiselectable="true"
          aria-label={`Strategies for ${ticker}`}
        >
          {strategies.map((strategy) => {
            const on = holding
              ? isTickerEnabledForStrategy(holding, strategy, portfolioId)
              : false;
            return (
              <li key={strategy.id} className="portfolio-ticker-suggestion">
                <button
                  type="button"
                  className={on ? "multiselect-option is-selected" : "multiselect-option"}
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(strategy.id, !on)}
                >
                  <span className="portfolio-ticker-symbol">{strategy.name}</span>
                </button>
                <Checkbox
                  checked={on}
                  aria-label={on ? `Remove ${strategy.name} from ${ticker}` : `Add ${strategy.name} to ${ticker}`}
                  onCheckedChange={(next) => onToggle(strategy.id, next)}
                />
              </li>
            );
          })}
          {strategies.length === 0 ? (
            <li className="multiselect-empty">Apply a strategy to this list in Strategy Forge first.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
