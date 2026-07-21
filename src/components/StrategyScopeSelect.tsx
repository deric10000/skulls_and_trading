import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaretDown } from "../lib/icons";
import type { Strategy } from "../types";

export type StrategyScopeSelectProps = {
  strategies: Strategy[];
  /** null = All strategies. */
  value: string | null;
  onChange: (strategyId: string | null) => void;
  "aria-label"?: string;
};

type MenuAlign = "start" | "end";

const VIEWPORT_PAD = 8;

/**
 * Prefer right-align (Helm) when the menu fits; otherwise left-align so the
 * panel stays inside the viewport (Current Watch mobile chip sits near the left).
 */
function pickMenuAlign(trigger: DOMRect, menuWidth: number): MenuAlign {
  const vw = window.innerWidth;
  const endLeft = trigger.right - menuWidth;
  if (endLeft >= VIEWPORT_PAD) return "end";
  if (trigger.left + menuWidth <= vw - VIEWPORT_PAD) return "start";
  const spaceRight = vw - trigger.left - VIEWPORT_PAD;
  const spaceLeft = trigger.right - VIEWPORT_PAD;
  return spaceRight >= spaceLeft ? "start" : "end";
}

/**
 * Gold Helm-style strategy scope chip (All strategies + one applied strategy).
 * Shared chrome with The Helm Progress header — reuse, don’t restyle.
 * Droplist flips start/end so it never clips off-screen.
 */
export function StrategyScopeSelect({
  strategies,
  value,
  onChange,
  "aria-label": ariaLabel = "Strategy scope",
}: StrategyScopeSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuAlign, setMenuAlign] = useState<MenuAlign>("end");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const focused = value
    ? strategies.find((strategy) => strategy.id === value)
    : undefined;
  const label = focused ? focused.name : "All strategies";

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

  useLayoutEffect(() => {
    if (!open) return;

    const updateAlign = () => {
      const root = rootRef.current;
      const menu = menuRef.current;
      if (!root || !menu) return;
      const trigger = root.getBoundingClientRect();
      setMenuAlign(pickMenuAlign(trigger, menu.offsetWidth));
    };

    updateAlign();
    window.addEventListener("resize", updateAlign);
    window.addEventListener("scroll", updateAlign, true);
    return () => {
      window.removeEventListener("resize", updateAlign);
      window.removeEventListener("scroll", updateAlign, true);
    };
  }, [open, strategies, value, label]);

  return (
    <div className="helm-scope-select" ref={rootRef}>
      <button
        type="button"
        className="chip helm-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <CaretDown className="helm-scope-caret" aria-hidden weight="bold" />
      </button>
      {open ? (
        <ul
          ref={menuRef}
          className={`multiselect-menu helm-scope-menu helm-scope-menu--${menuAlign}`}
          role="listbox"
          aria-label={ariaLabel}
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={
                value ? "multiselect-option" : "multiselect-option is-selected"
              }
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              All strategies
            </button>
          </li>
          {strategies.map((strategy) => (
            <li key={strategy.id}>
              <button
                type="button"
                role="option"
                aria-selected={value === strategy.id}
                className={
                  value === strategy.id
                    ? "multiselect-option is-selected"
                    : "multiselect-option"
                }
                onClick={() => {
                  onChange(strategy.id);
                  setOpen(false);
                }}
              >
                {strategy.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
