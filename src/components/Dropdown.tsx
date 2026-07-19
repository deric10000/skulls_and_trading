import type { ReactNode } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  /** Renders the native option as disabled (non-selectable, greyed). */
  disabled?: boolean;
  /**
   * Optional group label. Consecutive options sharing a group render inside a
   * single native `<optgroup>` (e.g. an "Intraday" cluster).
   */
  group?: string;
}

/** Walk options in order, wrapping consecutive same-group runs in <optgroup>. */
function renderOptions(options: DropdownOption[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < options.length) {
    const option = options[i];
    if (option.group) {
      const group = option.group;
      const grouped: DropdownOption[] = [];
      while (i < options.length && options[i].group === group) {
        grouped.push(options[i]);
        i += 1;
      }
      nodes.push(
        <optgroup key={`group-${group}`} label={group}>
          {grouped.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </optgroup>,
      );
    } else {
      nodes.push(
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>,
      );
      i += 1;
    }
  }
  return nodes;
}

/**
 * The app-wide dropdown. A native `<select>` skinned as `select.input` (the one
 * dropdown affordance — design-system CaretDown, gold focus ring), with the
 * portfolio switcher's look as the default.
 *
 * `variant`:
 * - `default` — standard surface dropdown (e.g. Current Watch portfolio switcher).
 * - `on-graphics` — dark translucent skin for use ONLY over imagery (e.g. the
 *   Market Weather condition art). Same affordance; the fill keeps it legible on
 *   busy backgrounds (per the Figma design).
 */
export function Dropdown({
  id,
  label,
  value,
  onChange,
  options,
  variant = "default",
  className,
}: {
  id: string;
  /** Accessible label, visually hidden — the select shows the current value. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  variant?: "default" | "on-graphics";
  /** Extra class on the <select> (e.g. width control). */
  className?: string;
}) {
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={[
          "input",
          variant === "on-graphics" ? "input--on-graphics" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {renderOptions(options)}
      </select>
    </>
  );
}
