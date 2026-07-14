/**
 * iOS WebKit sticky input-zoom workaround.
 *
 * Safari (and every iOS browser — all WebKit) auto-zooms focused inputs with
 * font-size < 16px. That zoom is useful while typing. After Done / blur /
 * submit, scale sometimes stays > 1 and crops the layout. This module snaps
 * back only when `visualViewport.scale` is stuck, via a brief maximum-scale=1
 * viewport write that is always restored (never left sticky — that would
 * block pinch-zoom on Android and hurt a11y).
 *
 * Desktop / typical Android: `scale` stays ~1 → no-op.
 * Chrome DevTools device mode does not reproduce iOS auto-zoom; use a real
 * device or Simulator for QA.
 */

const SCALE_STUCK_EPS = 1.01;
const RESTORE_DELAY_MS = 80;
const FOCUSOUT_DELAY_MS = 120;

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "radio",
  "file",
  "range",
  "hidden",
  "submit",
  "reset",
  "image",
  "color",
]);

let resetInFlight = false;
let focusoutTimer: ReturnType<typeof setTimeout> | undefined;

export function isTextEntryElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

export function isViewportZoomStuck(): boolean {
  const scale = window.visualViewport?.scale;
  return typeof scale === "number" && scale > SCALE_STUCK_EPS;
}

/** Soft short-circuit: iOS WebKit / touch-coarse. Scale check is the real lock. */
function isLikelyTouchSafariFamily(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS desktop-UA mode
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return true;
  }
  try {
    if (
      window.CSS?.supports?.(
        "(font: -apple-system-body) and (-webkit-touch-callout: none)",
      )
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return (
    "ontouchstart" in window &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function getViewportMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="viewport"]');
}

/**
 * If the visual viewport is stuck zoomed in, briefly clamp scale then restore
 * the prior viewport meta content so pinch-zoom remains available.
 */
export function resetIosInputZoom(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isViewportZoomStuck()) return;
  if (!isLikelyTouchSafariFamily()) return;
  if (resetInFlight) return;

  const meta = getViewportMeta();
  if (!meta) return;

  const previous = meta.getAttribute("content") ?? "width=device-width, initial-scale=1.0";
  resetInFlight = true;

  meta.setAttribute(
    "content",
    "width=device-width, initial-scale=1, maximum-scale=1",
  );

  window.setTimeout(() => {
    try {
      meta.setAttribute("content", previous);
      window.scrollTo(0, window.scrollY);
    } finally {
      resetInFlight = false;
    }
  }, RESTORE_DELAY_MS);
}

function activeElementIsTextEntry(): boolean {
  return isTextEntryElement(document.activeElement);
}

/**
 * App-wide: reset stuck zoom after text-entry dismiss, and when the visual
 * viewport resizes with no field focused (keyboard collapse / submit unmount).
 * Returns cleanup.
 */
export function installIosInputZoomReset(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const onFocusOut = (event: FocusEvent) => {
    if (!isTextEntryElement(event.target)) return;
    if (isTextEntryElement(event.relatedTarget)) return;

    if (focusoutTimer !== undefined) clearTimeout(focusoutTimer);
    focusoutTimer = setTimeout(() => {
      focusoutTimer = undefined;
      if (activeElementIsTextEntry()) return;
      resetIosInputZoom();
    }, FOCUSOUT_DELAY_MS);
  };

  const onVisualViewportResize = () => {
    if (activeElementIsTextEntry()) return;
    if (!isViewportZoomStuck()) return;
    resetIosInputZoom();
  };

  document.addEventListener("focusout", onFocusOut, true);
  window.visualViewport?.addEventListener("resize", onVisualViewportResize);

  return () => {
    document.removeEventListener("focusout", onFocusOut, true);
    window.visualViewport?.removeEventListener("resize", onVisualViewportResize);
    if (focusoutTimer !== undefined) {
      clearTimeout(focusoutTimer);
      focusoutTimer = undefined;
    }
  };
}
