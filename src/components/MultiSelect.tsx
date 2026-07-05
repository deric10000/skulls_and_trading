import { useEffect, useRef, useState } from "react";
import { CaretDown, CheckCircle } from "../lib/icons";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * A compact multi-select droplist: a trigger (styled like the app's select
 * input) that shows the chosen options as chips, opening a checkbox-style
 * popover. Closes on outside click or Escape. Used for "Applied Portfolios" on
 * the Configure card, but generic enough to reuse.
 */
export function MultiSelect({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder = "Select…",
}: {
  id: string;
  /** Accessible name (visually hidden — the trigger shows the chosen values). */
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  const chosen = options.filter((option) => selected.includes(option.value));

  return (
    <div className="multiselect" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="input multiselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="multiselect-value">
          {chosen.length > 0 ? (
            chosen.map((option) => (
              <span key={option.value} className="chip forge-portfolio-chip">
                {option.label}
              </span>
            ))
          ) : (
            <span className="multiselect-placeholder">{placeholder}</span>
          )}
        </span>
        <CaretDown className="multiselect-caret" aria-hidden weight="regular" />
      </button>

      {open ? (
        <ul
          className="multiselect-menu"
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
        >
          {options.map((option) => {
            const on = selected.includes(option.value);
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={
                    on ? "multiselect-option is-selected" : "multiselect-option"
                  }
                  onClick={() => toggle(option.value)}
                >
                  <span className="multiselect-check" aria-hidden>
                    {on ? <CheckCircle weight="fill" /> : null}
                  </span>
                  {option.label}
                </button>
              </li>
            );
          })}
          {options.length === 0 ? (
            <li className="multiselect-empty">No portfolios available.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
