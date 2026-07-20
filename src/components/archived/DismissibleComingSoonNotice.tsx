import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CLOSED_BETA_TRUST,
  COMING_SOON_HEADLINE,
} from "../../lib/closedBeta";
import { HardHat, X } from "../../lib/icons";

// ARCHIVED (not rendered anywhere) — ephemeral dismissible Coming Soon notice
// that used to open from The Helm preview's "Review alignment →" link (and
// briefly from Launch Dashboard before that CTA routed to DashboardPage).
// Was `ComingSoonOverlay` variant="dismissible". Parked intact so it can be
// dropped back in later. Live adopters use page-level ComingSoonOverlay
// (Dashboard / Ships / Captain Profile) or the legal gate — not this notice.

const DEFAULT_AUTO_DISMISS_MS = 8000;

export function DismissibleComingSoonNotice({
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}: {
  onDismiss: () => void;
  autoDismissMs?: number;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    if (!autoDismissMs || autoDismissMs <= 0) return;
    const timer = window.setTimeout(() => {
      onDismissRef.current?.();
    }, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="coming-soon-overlay coming-soon-overlay--gate"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="coming-soon-panel panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-soon-notice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="coming-soon-panel-bar">
          <div className="coming-soon-head">
            <HardHat
              className="coming-soon-icon"
              aria-hidden
              weight="fill"
            />
            <h2 id="coming-soon-notice-title" className="coming-soon-title">
              {COMING_SOON_HEADLINE}
            </h2>
          </div>
          <button
            type="button"
            className="forge-table-close"
            onClick={onDismiss}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>
        <p className="coming-soon-trust">{CLOSED_BETA_TRUST}</p>
      </div>
    </div>,
    document.body,
  );
}
