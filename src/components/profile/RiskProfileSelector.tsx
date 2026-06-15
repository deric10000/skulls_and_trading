import { RISK_OPTIONS } from "../../data";
import { useAppState } from "../../state/AppState";
import type { RiskProfile } from "../../types";
import { ChoiceGroup } from "../ChoiceGroup";

export function RiskProfileSelector() {
  const { captain, updateCaptain } = useAppState();

  return (
    <section className="panel selector-card" aria-labelledby="risk-title">
      <div className="panel-head">
        <h2 id="risk-title">Risk Profile</h2>
        <span className="panel-tag">Sets your guardrails</span>
      </div>
      <p className="panel-intro">
        This shapes how loudly the app flags when a position drifts past your own
        rules. It never tells you what to trade.
      </p>
      <ChoiceGroup<RiskProfile>
        label="How you size risk"
        options={RISK_OPTIONS}
        value={captain.risk}
        onChange={(risk) => updateCaptain({ risk })}
      />
    </section>
  );
}
