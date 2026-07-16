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
 * Desktop/tablet: shows on hover and on keyboard focus. Portaled to
 * `document.body` with stock `.tooltip` styles + inline fixed position so card
 * / panel `overflow: hidden` cannot clip it (e.g. Forge Configure InfoTips).
 * Position is clamped inside the viewport (prefer below; flip above when there
 * is room; otherwise pin).
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

  function clearDesktopInlineStyles() {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.position = "";
    tip.style.display = "";
    tip.style.left = "";
    tip.style.right = "";
    tip.style.top = "";
    tip.style.bottom = "";
    tip.style.transform = "";
    tip.style.maxHeight = "";
    tip.style.overflowY = "";
    tip.style.zIndex = "";
  }

  /**
   * Desktop/tablet only — fixed-position the portaled tip relative to the
   * trigger, clamped inside the viewport. Uses stock `.tooltip` look; only
   * layout is set inline (same approach as the pre-portal fixed-pin path).
   */
  function positionDesktopTooltip() {
    if (isMobile) return;
    const tip = tipRef.current;
    const wrap = wrapRef.current;
    if (!tip || !wrap) return;

    tip.style.position = "fixed";
    tip.style.display = "flex";
    tip.style.zIndex = "60";
    tip.style.maxHeight = "";
    tip.style.overflowY = "";
    tip.style.transform = "none";
    tip.style.right = "auto";
    tip.style.bottom = "auto";

    const trigger = wrap.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;

    let left = trigger.left;
    if (left + tipWidth > vw - VIEWPORT_PAD) {
      left = vw - VIEWPORT_PAD - tipWidth;
    }
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

    const spaceBelow = vh - trigger.bottom - VIEWPORT_PAD;
    const spaceAbove = trigger.top - VIEWPORT_PAD;
    let top: number;

    if (tipHeight + 8 <= spaceBelow) {
      top = trigger.bottom + 8;
    } else if (tipHeight + 8 <= spaceAbove) {
      top = trigger.top - tipHeight - 8;
    } else {
      const maxH = Math.max(80, vh - 2 * VIEWPORT_PAD);
      tip.style.maxHeight = `${maxH}px`;
      tip.style.overflowY = "auto";
      const measured = Math.min(tipHeight, maxH);
      top = Math.min(
        Math.max(VIEWPORT_PAD, trigger.bottom + 8),
        vh - VIEWPORT_PAD - measured,
      );
    }

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function scheduleDesktopPosition() {
    if (isMobile) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(positionDesktopTooltip);
    });
  }

  function openDesktop() {
    if (isMobile) return;
    setOpen(true);
  }

  function closeDesktop() {
    if (isMobile) return;
    setOpen(false);
    clearDesktopInlineStyles();
  }

  // Position after the portaled tip mounts / when open toggles on desktop.
  useEffect(() => {
    if (!open || isMobile) return;
    scheduleDesktopPosition();
  }, [open, isMobile, title, body, wide]);

  // Drop desktop inline offsets when switching to the mobile sheet.
  useEffect(() => {
    if (isMobile) clearDesktopInlineStyles();
  }, [isMobile]);

  // Mobile: close on any tap outside this tooltip's own wrap.
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

  // Keep desktop/tablet position correct if the viewport resizes while open.
  useEffect(() => {
    if (isMobile || !open) return;
    function onResize() {
      positionDesktopTooltip();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isMobile, open]);

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
      onMouseEnter={openDesktop}
      onMouseLeave={closeDesktop}
      onFocus={openDesktop}
      onBlur={(event) => {
        if (isMobile) return;
        const next = event.relatedTarget as Node | null;
        if (next && wrapRef.current?.contains(next)) return;
        closeDesktop();
      }}
      onClick={() => {
        if (isMobile) setOpen((prev) => !prev);
      }}
    >
      {children}
      {/* Portal whenever open so overflow:hidden cards (desktop) and sticky
          header backdrop-filter (mobile) cannot clip the tip. Mobile sheet
          placement stays `.tooltip--viewport-sheet`; desktop uses stock
          `.tooltip` + inline fixed pin only. */}
      {open && typeof document !== "undefined"
        ? createPortal(tip, document.body)
        : null}
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
