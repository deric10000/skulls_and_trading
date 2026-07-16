import { AuthButton } from "./auth/AuthButton";
import {
  LEGAL_DISCLAIMER_BODY,
  LEGAL_DISCLAIMER_TITLE,
} from "../lib/legal/disclaimer";

interface LegalDisclaimerModalProps {
  open: boolean;
  onAcknowledge: () => void;
}

/** Once-per-login risk acknowledgment — uses existing auth panel patterns. */
export function LegalDisclaimerModal({
  open,
  onAcknowledge,
}: LegalDisclaimerModalProps) {
  if (!open) return null;
  return (
    <div className="legal-disclaimer-backdrop" role="presentation">
      <div
        className="legal-disclaimer panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-disclaimer-title"
      >
        <h2 id="legal-disclaimer-title">{LEGAL_DISCLAIMER_TITLE}</h2>
        <p className="legal-disclaimer-body">{LEGAL_DISCLAIMER_BODY}</p>
        <AuthButton type="button" onClick={onAcknowledge}>
          I understand — continue
        </AuthButton>
      </div>
    </div>
  );
}
