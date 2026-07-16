import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, MagnifyingGlass } from "../lib/icons";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

/**
 * Searchable single-select for long catalogs (e.g. GICS Sector / Industry).
 *
 * Trigger reuses the app's `input` (+ optional `input--on-graphics`) look with
 * a CaretDown — same closed affordance as `Dropdown` / portfolio switcher.
 * The expanded panel is a typeahead list matching Current Watch ticker
 * suggestions (`.chip-search-field` + `.multiselect-menu` / `.multiselect-option`).
 * The open panel is portaled so Weather card `overflow: hidden` cannot clip it.
 */
export function SearchableSelect({
  id,
  label,
  value,
  onChange,
  options,
  variant = "default",
  searchPlaceholder = "Search…",
  className,
}: {
  id: string;
  /** Accessible name (visually hidden — the trigger shows the current value). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  variant?: "default" | "on-graphics";
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [panelBox, setPanelBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const updatePanelBox = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelBox({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelBox(null);
      return;
    }
    updatePanelBox();
    const onReposition = () => updatePanelBox();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setHighlight((current) =>
      filtered.length === 0 ? 0 : Math.min(current, filtered.length - 1),
    );
  }, [filtered.length]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setHighlight((current) => (current + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setHighlight(
        (current) => (current - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const hit = filtered[highlight];
      if (hit) pick(hit.value);
    }
  }

  const panel =
    open && panelBox
      ? createPortal(
          <div
            ref={panelRef}
            className="searchable-select-panel"
            style={{
              top: panelBox.top,
              left: panelBox.left,
              width: panelBox.width,
            }}
          >
            <div className="chip-search-field">
              <MagnifyingGlass
                className="chip-search-icon"
                aria-hidden
                weight="regular"
              />
              <input
                ref={searchRef}
                className="input chip-search-input"
                placeholder={searchPlaceholder}
                value={query}
                autoComplete="off"
                aria-label={`Search ${label.toLowerCase()}`}
                aria-controls={listId}
                aria-autocomplete="list"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKeyDown}
              />
            </div>
            <ul
              id={listId}
              className="multiselect-menu searchable-select-menu"
              role="listbox"
              aria-label={label}
            >
              {filtered.map((option, index) => {
                const selected = option.value === value;
                const active = index === highlight;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={[
                        "multiselect-option",
                        selected ? "is-selected" : "",
                        active ? "is-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(option.value)}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="multiselect-empty">No matches.</li>
              ) : null}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={["searchable-select", className ?? ""].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        className={[
          "input",
          "searchable-select-trigger",
          variant === "on-graphics" ? "input--on-graphics" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="searchable-select-value">{selectedLabel}</span>
        <CaretDown className="searchable-select-caret" aria-hidden weight="regular" />
      </button>
      {panel}
    </div>
  );
}
