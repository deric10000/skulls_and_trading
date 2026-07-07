import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ActionMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * A small button-triggered action menu (per the Select / dropdown standard's
 * sibling pattern for "pick an action" rather than "pick a value" — see
 * `MultiSelect` for the value-picking equivalent this mirrors). The trigger
 * renders exactly as given (e.g. a `.btn`); clicking it opens a short list of
 * one-shot actions below it. Closes on outside click, Escape, or selecting an
 * item. Used by the Rule Chips table modal's "Add Rule" split button.
 */
export function ActionMenu({
  trigger,
  items,
  label,
}: {
  /** Render-prop trigger so the caller owns the button's exact markup/classes. */
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: ActionMenuItem[];
  /** Accessible name for the menu list. */
  label: string;
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

  return (
    <div className="action-menu" ref={rootRef}>
      {trigger({ open, toggle: () => setOpen((current) => !current) })}
      {open ? (
        <ul className="action-menu-list" role="menu" aria-label={label}>
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="action-menu-item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
