import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export type WatchTotalsWrapPhase = "none" | "pnl" | "cash";

/**
 * Collision-driven wrap for the Current Watch running-totals footer.
 * Measures intrinsic stat content widths (not flex-grown boxes) and only then
 * applies wrap phases — never stacks from a viewport/container breakpoint.
 *
 * - none: Total | Open P&L (centered) | Cash
 * - pnl:  Total + Cash on row 1; Open P&L under Total (left)
 * - cash: Total → Open P&L → Cash, all left
 */
export function useWatchTotalsWrap(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): WatchTotalsWrapPhase {
  const phaseRef = useRef<WatchTotalsWrapPhase>("none");
  const widthsRef = useRef({ total: 0, pnl: 0, cash: 0, gap: 0 });
  const [phase, setPhase] = useState<WatchTotalsWrapPhase>("none");

  useLayoutEffect(() => {
    if (!enabled) {
      phaseRef.current = "none";
      setPhase("none");
      return;
    }

    const row = ref.current;
    if (!row) return;

    const contentWidth = (stat: HTMLElement) => {
      let width = 0;
      for (const child of stat.children) {
        width = Math.max(width, (child as HTMLElement).scrollWidth);
      }
      return width;
    };

    const measure = () => {
      const stats = row.querySelectorAll<HTMLElement>(".watch-totals-stat");
      if (stats.length !== 3) return;

      const styles = getComputedStyle(row);
      const gap =
        Number.parseFloat(styles.columnGap || styles.gap || "0") || 8;

      // Intrinsic widths are only trustworthy in the 3-up row. Cache them
      // there; reuse while wrapped (full-width items report the row width).
      if (phaseRef.current === "none") {
        widthsRef.current = {
          total: contentWidth(stats[0]),
          pnl: contentWidth(stats[1]),
          cash: contentWidth(stats[2]),
          gap,
        };
      }

      const { total, pnl, cash } = widthsRef.current;
      if (total <= 0 || pnl <= 0 || cash <= 0) return;

      const width = row.clientWidth;
      const needThree = total + pnl + cash + gap * 2;
      const needTopRow = total + cash + gap;

      let next: WatchTotalsWrapPhase = "none";
      if (width < needTopRow) next = "cash";
      else if (width < needThree) next = "pnl";

      phaseRef.current = next;
      setPhase(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [enabled, ref]);

  return phase;
}
