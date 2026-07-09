import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/**
 * Shared Forge chip pill — one component, state-driven styles.
 *
 * States (mutually exclusive visual modes):
 * - default  — static chip (Configure box, Watch Summary breakdown)
 * - selected — same as default + border (toggle pressed)
 * - inactive — outline / muted (toggle not pressed)
 * - muted    — system tag look
 * - off      — dimmed / excluded
 *
 * Variant `applied` tints green for portfolio-coverage chips (Tickers tab).
 */
export type ForgePillState =
  | "default"
  | "selected"
  | "inactive"
  | "muted"
  | "off";

export type ForgePillVariant = "default" | "applied";

type ForgePillProps = {
  children: ReactNode;
  state?: ForgePillState;
  variant?: ForgePillVariant;
  title?: string;
  className?: string;
  onClick?: () => void;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement> & HTMLAttributes<HTMLSpanElement>,
  "onClick" | "className" | "title" | "children"
>;

function pillClassName(
  state: ForgePillState,
  variant: ForgePillVariant,
  className?: string,
): string {
  const classes = ["forge-pill"];

  if (variant === "applied") classes.push("forge-pill--applied");

  if (state === "muted") classes.push("forge-pill--muted");
  if (state === "off") classes.push("forge-pill--off");

  if (state === "selected" || state === "inactive") {
    classes.push("forge-pill--toggle");
    if (state === "selected") classes.push("forge-pill--on");
  }

  if (className) classes.push(className);
  return classes.join(" ");
}

export function ForgePill({
  children,
  state = "default",
  variant = "default",
  title,
  className,
  onClick,
  ...rest
}: ForgePillProps) {
  const classes = pillClassName(state, variant, className);

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        title={title}
        aria-pressed={
          state === "selected" ? true : state === "inactive" ? false : undefined
        }
        onClick={onClick}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      className={classes}
      title={title}
      tabIndex={0}
      {...(rest as HTMLAttributes<HTMLSpanElement>)}
    >
      {children}
    </span>
  );
}
