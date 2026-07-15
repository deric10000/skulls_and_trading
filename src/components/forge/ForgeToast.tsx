import type { ReactNode } from "react";
import { CheckCircle, Info, Warning, X } from "../../lib/icons";

export type ForgeToastTone = "warning" | "error" | "success" | "info";

const TONE_ICON = {
  warning: Warning,
  error: Warning,
  success: CheckCircle,
  info: Info,
} as const;

export function ForgeToast({
  tone,
  children,
  onDismiss,
  dismissLabel = "Dismiss notification",
  className,
}: {
  tone: ForgeToastTone;
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}) {
  const Icon = TONE_ICON[tone];
  const role = tone === "success" ? "status" : "alert";
  const classes = ["forge-toast", `forge-toast--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role={role}>
      {tone === "error" ? (
        <span className="forge-toast-icon forge-toast-icon--error" aria-hidden="true">
          !
        </span>
      ) : (
        <Icon
          className="forge-toast-icon"
          aria-hidden
          weight={tone === "warning" || tone === "success" ? "fill" : "regular"}
        />
      )}
      <div className="forge-toast-body">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          className="forge-toast-dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X aria-hidden weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
