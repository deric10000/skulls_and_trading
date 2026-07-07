import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info, X } from "../lib/icons";

// Touch has no hover, so the desktop hover/focus-within reveal doesn't work on
// mobile. Below 767px the tooltip switches to tap-to-toggle instead (CSS hides
// the hover reveal and shows only `.is-open`, driven by this).
function useIsMobile() {
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

/**
 * Design-system tooltip (per the Figma tooltip pattern): a dark rounded
 * popover with an optional bold title and body copy. The content is wired via
 * `aria-describedby` so screen readers announce it too.
 *
 * Desktop/tablet: shows on hover and on keyboard focus (unchanged).
 * Mobile (< 768px): touch has no hover, so tapping the trigger toggles the
 * tooltip instead. It renders as a sheet fixed to the bottom-center of the
 * viewport (not anchored to the trigger) with its own close (X) button, since
 * there's no hover-out or click-away-from-focus to dismiss it. It also closes
 * on any tap outside its own wrap — which covers navigating away and
 * switching tabs/sections for free, since those always start with a tap
 * somewhere outside this tooltip.
 *
 * `Tooltip` wraps any trigger; `InfoTip` is the common info-icon trigger used
 * beside section labels on the Configure card.
 */
export function Tooltip({
  title,
  body,
  children,
  wide,
}: {
  title?: string;
  body: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Mobile: close on any tap outside this tooltip's own wrap. This single
  // mechanism covers every dismiss case the mobile sheet needs — a genuine
  // outside tap, switching to a different tab/section (in-app "pages" that
  // toggle via CSS rather than unmounting, e.g. the Configure card's section
  // tabs), and navigating to a different app page via the top nav — all of
  // which begin with a tap on something outside this wrap. (A real page
  // *unmount* also resets `open` for free, since the whole component tree —
  // Tooltip included — goes away with it.)
  useEffect(() => {
    if (!isMobile || !open) return;
    function handlePointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMobile, open]);

  return (
    <span
      ref={wrapRef}
      className={open ? "tooltip-wrap is-open" : "tooltip-wrap"}
      aria-describedby={id}
      onClick={() => {
        if (isMobile) setOpen((prev) => !prev);
      }}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={wide ? "tooltip tooltip--wide" : "tooltip"}
      >
        <button
          type="button"
          className="tooltip-close"
          aria-label="Close tooltip"
          tabIndex={open ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <X aria-hidden weight="bold" />
        </button>
        {title ? <span className="tooltip-title">{title}</span> : null}
        <span className="tooltip-body">{body}</span>
      </span>
    </span>
  );
}

/** Info-icon tooltip trigger (the ⓘ beside labels on the Configure card). */
export function InfoTip({
  label,
  title,
  body,
  wide,
}: {
  /** Accessible name for the icon button, e.g. "About thesis tags". */
  label: string;
  title?: string;
  body: ReactNode;
  wide?: boolean;
}) {
  return (
    <Tooltip title={title} body={body} wide={wide}>
      <button type="button" className="info-tip" aria-label={label}>
        <Info aria-hidden weight="regular" />
      </button>
    </Tooltip>
  );
}
