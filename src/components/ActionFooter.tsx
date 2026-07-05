import type { ReactNode } from "react";
import { useStackedRow } from "../lib/useStackedRow";

/**
 * The shared card action footer — a divider + button row pinned to the bottom
 * of a card's flex column (via `.strategy-footer`). When its `.btn` children
 * can't share a row it flips to a full-width stacked column (`.is-stacked`,
 * measured by useStackedRow), exactly like the My Strategies footer. Pass any
 * buttons as children; an optional `className` scopes per-use tweaks.
 */
export function ActionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, stacked } = useStackedRow<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={["strategy-footer", stacked ? "is-stacked" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
