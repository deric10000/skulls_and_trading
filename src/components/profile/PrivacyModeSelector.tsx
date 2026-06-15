import { PRIVACY_NOTES, PRIVACY_OPTIONS } from "../../data";
import { useAppState } from "../../state/AppState";
import type { PrivacyMode } from "../../types";
import { ChoiceGroup } from "../ChoiceGroup";

export function PrivacyModeSelector() {
  const { captain, updateCaptain } = useAppState();

  return (
    <section className="panel selector-card" aria-labelledby="privacy-title">
      <div className="panel-head">
        <h2 id="privacy-title">Privacy Mode</h2>
        <span className="panel-tag">Default: Private</span>
      </div>
      <ChoiceGroup<PrivacyMode>
        label="Who can see your activity"
        options={PRIVACY_OPTIONS}
        value={captain.privacy}
        onChange={(privacy) => updateCaptain({ privacy })}
      />
      <p className="privacy-note">{PRIVACY_NOTES[captain.privacy]}</p>
      <p className="auth-safety">
        Your treasure stays buried unless you choose to share it. Portfolio values,
        holdings, broker data, and trade size stay private unless you opt in.
      </p>
    </section>
  );
}
