import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CLOSED_BETA_TRUST,
  COMING_SOON_HEADLINE,
} from "../lib/closedBeta";
import { HardHat } from "../lib/icons";

/**
 * Full-viewport overlay for Closed Beta unfinished surfaces (Dashboard,
 * Ships). Content stays visible underneath; the fixed scrim blocks
 * interaction and page scroll. Header stays above so TopNav remains usable.
 *
 * The scrim is portaled to `document.body` so `app-main` padding / layout
 * cannot shrink it — it always covers the viewport. Panel chrome mirrors
 * Strategy Forge / app modal cards — no close control. Documented in
 * `.cursor/rules/components.mdc`.
 *
 * Mobile: panel parks under the sticky header via overlay padding.
 * Desktop/tablet: panel stays centered in the viewport.
 */
export function ComingSoonOverlay({ children }: { children: ReactNode }) {
  // Belt-and-suspenders with the CSS `:has(.coming-soon-shell)` scroll lock —
  // also set overflow on mount in case older browsers miss `:has`.
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

  const overlay =
    typeof document !== "undefined" ? (
      <div
        className="coming-soon-overlay"
        role="status"
        aria-live="polite"
        aria-label={`${COMING_SOON_HEADLINE}. ${CLOSED_BETA_TRUST}`}
      >
        <div className="coming-soon-panel panel">
          <div className="coming-soon-head">
            <HardHat
              className="coming-soon-icon"
              aria-hidden
              weight="fill"
            />
            <h2 className="coming-soon-title">{COMING_SOON_HEADLINE}</h2>
          </div>
          <p className="coming-soon-trust">{CLOSED_BETA_TRUST}</p>
        </div>
      </div>
    ) : null;

  return (
    <div className="coming-soon-shell">
      <div className="coming-soon-content" inert aria-hidden="true">
        {children}
      </div>
      {overlay ? createPortal(overlay, document.body) : null}
    </div>
  );
}
