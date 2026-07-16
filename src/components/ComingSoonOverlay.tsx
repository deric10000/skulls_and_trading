import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CLOSED_BETA_TRUST,
  COMING_SOON_HEADLINE,
} from "../lib/closedBeta";
import { HardHat, Warning, X } from "../lib/icons";
import {
  LEGAL_DISCLAIMER_BODY,
  LEGAL_DISCLAIMER_TITLE,
} from "../lib/legal/disclaimer";

type ComingSoonProps = {
  variant?: "coming-soon";
  children: ReactNode;
  onAcknowledge?: never;
  onDismiss?: never;
  autoDismissMs?: never;
};

type LegalAckProps = {
  /** Once-per-login legal acknowledgment — same blurred scrim + panel chrome. */
  variant: "legal";
  children?: never;
  onAcknowledge: () => void;
  onDismiss?: never;
  autoDismissMs?: never;
};

type DismissibleProps = {
  /**
   * Ephemeral Coming Soon notice (same HardHat + trust copy). Portal-only;
   * dismiss via X or `autoDismissMs` (default 8000).
   */
  variant: "dismissible";
  children?: never;
  onAcknowledge?: never;
  onDismiss: () => void;
  autoDismissMs?: number;
};

export type ComingSoonOverlayProps =
  | ComingSoonProps
  | LegalAckProps
  | DismissibleProps;

const DEFAULT_AUTO_DISMISS_MS = 8000;

/**
 * Full-viewport overlay for Closed Beta unfinished surfaces (Dashboard,
 * Ships, Captain Profile), the once-per-login legal acknowledgment, and
 * ephemeral Coming Soon notices.
 * Content stays visible underneath; the fixed scrim blocks interaction and
 * page scroll.
 *
 * The scrim is portaled to `document.body` so `app-main` padding / layout
 * cannot shrink it — it always covers the viewport. Panel chrome mirrors
 * Strategy Forge / app modal cards. Documented in `.cursor/rules/components.mdc`.
 *
 * States:
 * - `coming-soon` (default): HardHat + trust copy; no close/actions. Header
 *   stays above so TopNav remains usable. Wraps page children as inert.
 * - `legal`: Warning + disclaimer copy + primary "Accept and Continue".
 *   Blocks the full viewport (including header) until acknowledged.
 * - `dismissible`: same Coming Soon panel as default, with close (X) and
 *   optional auto-dismiss. Portal-only; does not wrap page children.
 *
 * Mobile: panel parks under the sticky header via overlay padding.
 * Desktop/tablet: panel stays centered in the viewport.
 */
export function ComingSoonOverlay(props: ComingSoonOverlayProps) {
  const variant = props.variant ?? "coming-soon";
  const isLegal = variant === "legal";
  const isDismissible = variant === "dismissible";
  const onDismiss = isDismissible ? props.onDismiss : undefined;
  const autoDismissMs = isDismissible
    ? (props.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS)
    : undefined;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

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

  useEffect(() => {
    if (!isDismissible || !autoDismissMs || autoDismissMs <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      onDismissRef.current?.();
    }, autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [isDismissible, autoDismissMs]);

  const comingSoonBody = (
    <>
      <div className="coming-soon-head">
        <HardHat
          className="coming-soon-icon"
          aria-hidden
          weight="fill"
        />
        <h2
          id={isDismissible ? "coming-soon-notice-title" : undefined}
          className="coming-soon-title"
        >
          {COMING_SOON_HEADLINE}
        </h2>
      </div>
      <p className="coming-soon-trust">{CLOSED_BETA_TRUST}</p>
    </>
  );

  const panel = isLegal ? (
    <div
      className="coming-soon-panel panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coming-soon-legal-title"
    >
      <div className="coming-soon-head">
        <Warning
          className="coming-soon-icon"
          aria-hidden
          weight="fill"
        />
        <h2 id="coming-soon-legal-title" className="coming-soon-title">
          {LEGAL_DISCLAIMER_TITLE}
        </h2>
      </div>
      <p className="coming-soon-trust">{LEGAL_DISCLAIMER_BODY}</p>
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={props.onAcknowledge}
      >
        Accept and Continue
      </button>
    </div>
  ) : isDismissible ? (
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
  ) : (
    <div className="coming-soon-panel panel">{comingSoonBody}</div>
  );

  const overlay =
    typeof document !== "undefined" ? (
      <div
        className={
          isLegal || isDismissible
            ? "coming-soon-overlay coming-soon-overlay--gate"
            : "coming-soon-overlay"
        }
        role={isLegal || isDismissible ? "presentation" : "status"}
        aria-live={isLegal || isDismissible ? undefined : "polite"}
        aria-label={
          isLegal || isDismissible
            ? undefined
            : `${COMING_SOON_HEADLINE}. ${CLOSED_BETA_TRUST}`
        }
        onClick={isDismissible ? onDismiss : undefined}
      >
        {panel}
      </div>
    ) : null;

  if (isLegal || isDismissible) {
    return overlay ? createPortal(overlay, document.body) : null;
  }

  return (
    <div className="coming-soon-shell">
      <div className="coming-soon-content" inert aria-hidden="true">
        {props.children}
      </div>
      {overlay ? createPortal(overlay, document.body) : null}
    </div>
  );
}
