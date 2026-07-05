import { useLayoutEffect, useRef, useState } from "react";

/**
 * Collision-driven button-row stacking, shared by the Strategy Forge action
 * footers (My Strategies dock, Configure card actions, Apply-to-Portfolio bar).
 *
 * Measures the natural width of the `.btn` children and, once they'd overflow
 * the container, flips the row to `.is-stacked` (full-width column) — the exact
 * behavior of the My Strategies footer. Returns a ref to attach to the row and
 * the current `stacked` flag. Re-measures on container resize.
 */
export function useStackedRow<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const stackedRef = useRef(false);
  const requiredWidthRef = useRef(0);
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;

    const measure = () => {
      const buttons = row.querySelectorAll<HTMLElement>(".btn");
      // Only re-measure the natural row width while we're in the row layout —
      // once stacked, the buttons are full-width and would report the wrong size.
      if (!stackedRef.current) {
        const gap = 8; // 0.5rem flex gap
        let total = 0;
        buttons.forEach((button) => {
          total += button.offsetWidth;
        });
        requiredWidthRef.current = total + gap * Math.max(0, buttons.length - 1);
      }
      const shouldStack =
        requiredWidthRef.current > 0 &&
        row.clientWidth < requiredWidthRef.current;
      stackedRef.current = shouldStack;
      setStacked(shouldStack);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return { ref, stacked };
}
