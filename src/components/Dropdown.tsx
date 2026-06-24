export interface DropdownOption {
  value: string;
  label: string;
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
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
