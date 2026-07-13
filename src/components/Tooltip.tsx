import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info, X } from "../lib/icons";
import { useIsMobile } from "../lib/useIsMobile";

const VIEWPORT_PAD = 8;

/**
 * Design-system tooltip (per the Figma tooltip pattern): a dark rounded
 * popover with an optional bold title and body copy. The content is wired via
 * `aria-describedby` so screen readers announce it too.
 *
 * Desktop/tablet: shows on hover and on keyboard focus. Position is clamped so
 * the popover stays inside the viewport (shift X; flip above only when there
 * is room; otherwise pin within the viewport).
 * Mobile (< 768px): tap-to-toggle sheet fixed to the bottom-center of the
 * viewport. The sheet is portaled to `document.body` so sticky header
 * `backdrop-filter` / containing blocks cannot clip it (e.g. TopNav Demo chip).
 * Forge rule-chip / tag tooltips keep the same bottom-center sheet — do not
 * invent a separate mobile placement for those.
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
  const tipRef = useRef<HTMLSpanElement>(null);

  function clearDesktopClamp() {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.position = "";
    tip.style.left = "";
    tip.style.right = "";
    tip.style.top = "";
    tip.style.bottom = "";
    tip.style.transform = "";
    tip.style.maxHeight = "";
    tip.style.overflowY = "";
  }

  /**
   * Desktop/tablet only — keep `.tooltip` inside the viewport.
   * Prefer below the trigger; flip above only when there is enough room;
   * otherwise pin with `position: fixed` inside the viewport bounds.
   */
  function clampDesktopTooltip() {
    if (isMobile) return;
    const tip = tipRef.current;
    const wrap = wrapRef.current;
    if (!tip || !wrap) return;

    // Reset to CSS defaults before measuring.
    tip.style.position = "";
    tip.style.left = "0";
    tip.style.right = "auto";
    tip.style.top = "calc(100% + 8px)";
    tip.style.bottom = "auto";
    tip.style.transform = "none";
    tip.style.maxHeight = "";
    tip.style.overflowY = "";

    const rect = tip.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const trigger = wrap.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipHeight = rect.height;
    const tipWidth = rect.width;

    let shiftX = 0;
    if (rect.right > vw - VIEWPORT_PAD) {
      shiftX = vw - VIEWPORT_PAD - rect.right;
    }
    if (rect.left + shiftX < VIEWPORT_PAD) {
      shiftX = VIEWPORT_PAD - rect.left;
    }
    tip.style.transform =
      shiftX !== 0 ? `translateX(${shiftX}px)` : "none";

    const afterX = tip.getBoundingClientRect();
    const overflowsBottom = afterX.bottom > vh - VIEWPORT_PAD;
    const spaceAbove = trigger.top - VIEWPORT_PAD;
    const spaceBelow = vh - trigger.bottom - VIEWPORT_PAD;

    if (overflowsBottom) {
      if (spaceAbove >= tipHeight + 8) {
        // Room above — flip.
        tip.style.top = "auto";
        tip.style.bottom = "calc(100% + 8px)";
        tip.style.transform =
          shiftX !== 0 ? `translateX(${shiftX}px)` : "none";
      } else {
        // No room to flip (header / top-of-viewport triggers) — fixed pin.
        const left = Math.min(
          Math.max(VIEWPORT_PAD, trigger.left + shiftX),
          vw - VIEWPORT_PAD - tipWidth,
        );
        const maxH = Math.max(80, vh - 2 * VIEWPORT_PAD);
        const top = Math.min(
          Math.max(VIEWPORT_PAD, trigger.bottom + 8),
          vh - VIEWPORT_PAD - Math.min(tipHeight, maxH),
        );
        tip.style.position = "fixed";
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.bottom = "auto";
        tip.style.right = "auto";
        tip.style.transform = "none";
        tip.style.maxHeight = `${maxH}px`;
        tip.style.overflowY = "auto";
      }
    } else if (afterX.top < VIEWPORT_PAD) {
      // Somehow above the fold — pin below with fixed.
      const left = Math.min(
        Math.max(VIEWPORT_PAD, afterX.left),
        vw - VIEWPORT_PAD - tipWidth,
      );
      tip.style.position = "fixed";
      tip.style.left = `${left}px`;
      tip.style.top = `${VIEWPORT_PAD}px`;
      tip.style.bottom = "auto";
      tip.style.transform = "none";
    }

    // Prefer the side with more room when both overflow (narrow landscape).
    void spaceBelow;
  }

  function scheduleDesktopClamp() {
    if (isMobile) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(clampDesktopTooltip);
    });
  }

  // Drop any desktop inline offsets when switching to the mobile sheet.
  useEffect(() => {
    if (isMobile) clearDesktopClamp();
  }, [isMobile]);

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
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (tipRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMobile, open]);

  // Keep desktop/tablet clamp correct if the viewport resizes while open.
  useEffect(() => {
    if (isMobile) return;
    function onResize() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      if (wrap.matches(":hover") || wrap.matches(":focus-within")) {
        clampDesktopTooltip();
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isMobile]);

  const tipClassName = [
    "tooltip",
    wide ? "tooltip--wide" : null,
    isMobile && open ? "tooltip--viewport-sheet" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const tip = (
    <span ref={tipRef} id={id} role="tooltip" className={tipClassName}>
      <button
        type="button"
        className="tooltip-close"
        aria-label="Close tooltip"
        tabIndex={isMobile && open ? 0 : -1}
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
  );

  return (
    <span
      ref={wrapRef}
      className={open ? "tooltip-wrap is-open" : "tooltip-wrap"}
      aria-describedby={id}
      onMouseEnter={scheduleDesktopClamp}
      onFocus={scheduleDesktopClamp}
      onMouseLeave={() => {
        if (!isMobile) clearDesktopClamp();
      }}
      onClick={() => {
        if (isMobile) setOpen((prev) => !prev);
      }}
    >
      {children}
      {/* Mobile open: portal to body so sticky header backdrop-filter cannot
          trap `position: fixed` (Demo chip). Same bottom-center sheet CSS as
          Forge chips/tags — placement unchanged. */}
      {isMobile && open && typeof document !== "undefined"
        ? createPortal(tip, document.body)
        : tip}
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
