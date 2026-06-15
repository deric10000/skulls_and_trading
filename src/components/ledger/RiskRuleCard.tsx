import { RISK_RULES } from "../../data";

export function RiskRuleCard() {
  return (
    <section className="panel risk-rule-card" aria-labelledby="risk-rule-title">
      <div className="panel-head">
        <h2 id="risk-rule-title">Risk Rules</h2>
        <span className="panel-tag">Your guardrails</span>
      </div>
      <ul className="risk-rule-list">
        {RISK_RULES.map((rule) => (
          <li key={rule.label} className="risk-rule-item">
            <span className={`risk-rule-dot risk-rule-dot--${rule.status}`} aria-hidden="true" />
            <div className="risk-rule-body">
              <span className="risk-rule-label">{rule.label}</span>
              <span className="risk-rule-detail">{rule.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
