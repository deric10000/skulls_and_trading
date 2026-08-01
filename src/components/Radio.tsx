import type { ButtonHTMLAttributes } from "react";

type RadioProps = {
  checked: boolean;
  /** Required unless `decorative` — selects this option. */
  onCheckedChange?: () => void;
  disabled?: boolean;
  className?: string;
  /** Visual-only mark for a parent that already owns the click and semantics. */
  decorative?: boolean;
  "aria-label"?: string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onChange" | "aria-checked" | "role" | "children"
>;

/** App radio — the circular single-choice counterpart to `Checkbox`. */
export function Radio({
  checked,
  onCheckedChange,
  disabled = false,
  className = "",
  decorative = false,
  "aria-label": ariaLabel,
  onClick,
  ...rest
}: RadioProps) {
  const classes = ["radio", checked ? "is-checked" : "", className]
    .filter(Boolean)
    .join(" ");
  const indicator = <span className="radio-indicator" aria-hidden="true" />;

  if (decorative) {
    return (
      <span className={classes} aria-hidden="true">
        {indicator}
      </span>
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={classes}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled || checked) return;
        onCheckedChange?.();
      }}
      {...rest}
    >
      {indicator}
    </button>
  );
}
