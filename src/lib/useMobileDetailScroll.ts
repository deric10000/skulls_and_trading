import { useLayoutEffect } from "react";

/** Start each mobile master-to-detail transition at the top of the page. */
export function useMobileDetailScroll(
  detailKey: string | boolean | null | undefined,
): void {
  useLayoutEffect(() => {
    if (
      !detailKey ||
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 767px)").matches
    ) {
      return;
    }

    const reset = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    reset();
    // Mobile Safari can restore the prior position after React replaces a
    // shorter master view. Repeat after layout so that restoration cannot
    // strand the new detail below the viewport.
    const frame = window.requestAnimationFrame(reset);
    return () => window.cancelAnimationFrame(frame);
  }, [detailKey]);
}
