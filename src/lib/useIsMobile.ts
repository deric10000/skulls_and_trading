import { useEffect, useState } from "react";

/**
 * Tracks whether the viewport is at/below the app's mobile breakpoint
 * (< 768px, see components.mdc "Responsive breakpoints"). Shared by anything
 * that needs a JS-level mobile branch (CSS alone can't do it) — e.g. switching
 * an interaction model (tap-to-toggle vs. hover) or swapping in a mobile-only
 * compact row layout.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}
