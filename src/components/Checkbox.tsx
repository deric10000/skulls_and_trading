import type { ButtonHTMLAttributes } from "react";
import { CheckSquare, Square } from "../lib/icons";

type CheckboxProps = {
  checked: boolean;
  /** Required unless `decorative` — toggles checked state. */
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  /**
   * Visual-only mark for a parent that already owns the click / a11y
   * (e.g. a MultiSelect option row). Renders a non-interactive span.
   */
  decorative?: boolean;
  "aria-label"?: string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onChange" | "aria-checked" | "role" | "children"
>;

/**
 * App checkbox — blue info square (28×28) with Phosphor Square / CheckSquare.
 * Use this for every on/off checkbox; do not ship native `<input type="checkbox">`
 * or one-off check icons.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  className = "",
  decorative = false,
  "aria-label": ariaLabel,
  onClick,
  ...rest
}: CheckboxProps) {
  const classes = ["checkbox", checked ? "is-checked" : "", className]
    .filter(Boolean)
    .join(" ");
  const icon = checked ? (
    <CheckSquare aria-hidden weight="fill" />
  ) : (
    <Square aria-hidden weight="regular" />
  );

  if (decorative) {
    return (
      <span className={classes} aria-hidden="true">
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={classes}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) return;
        onCheckedChange?.(!checked);
      }}
      {...rest}
    >
      {icon}
    </button>
  );
}
