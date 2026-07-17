import { useLayoutEffect, type ReactNode } from "react";
import { useStackedRow } from "../lib/useStackedRow";
import { useWatchTotalsWrap } from "../lib/useWatchTotalsWrap";

/**
 * The shared card action footer — a divider + button row pinned to the bottom
 * of a card's flex column (via `.strategy-footer`). When its `.btn` children
 * can't share a row it flips to a full-width stacked column (`.is-stacked`,
 * measured by useStackedRow), exactly like the My Strategies footer. Pass any
 * buttons as children; an optional `className` scopes per-use tweaks.
 *
 * Current Watch totals (`.watch-totals-footer`) also get collision-only wrap
 * classes from useWatchTotalsWrap — never breakpoint-forced stacking.
 */
export function ActionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, stacked } = useStackedRow<HTMLDivElement>();
  const isTotals = Boolean(className?.includes("watch-totals-footer"));
  const totalsWrap = useWatchTotalsWrap(ref, isTotals);
  const totalsWrapClass =
    totalsWrap === "cash"
      ? "is-wrap-pnl is-wrap-cash"
      : totalsWrap === "pnl"
        ? "is-wrap-pnl"
        : "";

  // Report this footer's own rendered height as --sticky-footer-h so other
  // viewport-fixed UI (currently the mobile Tooltip sheet) can clear it
  // instead of overlapping it — mirrors --app-header-h in AppShell. Only
  // meaningful where the footer is actually pinned to the viewport bottom
  // (mobile, via `position: sticky`); harmless elsewhere since nothing reads
  // the variable outside that context. Assumes at most one ActionFooter is
  // visible at a time (true today — the Forge dock and Configure card footer
  // are mutually exclusive on mobile); revisit if that ever changes.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const root = document.documentElement;
    const setHeight = () =>
      root.style.setProperty("--sticky-footer-h", `${node.offsetHeight}px`);

    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(node);
    window.addEventListener("resize", setHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setHeight);
      root.style.removeProperty("--sticky-footer-h");
    };
  }, [ref]);

  return (
    <div
      ref={ref}
      className={[
        "strategy-footer",
        stacked ? "is-stacked" : "",
        totalsWrapClass,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
