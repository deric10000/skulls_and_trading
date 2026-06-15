import { PORTFOLIO_METRICS, POSITIONS } from "../../data";
import { useAppState } from "../../state/AppState";
import { AllocationCard } from "./AllocationCard";
import { PortfolioMetricCard } from "./PortfolioMetricCard";
import { PositionCard } from "./PositionCard";
import { RiskRuleCard } from "./RiskRuleCard";

export function TreasureLedger() {
  const { captain } = useAppState();
  const valuesHidden = captain.privacy === "Private" || captain.privacy === "Ghost";

  return (
    <section className="panel treasure-ledger" aria-labelledby="ledger-title">
      <div className="panel-head">
        <h2 id="ledger-title">Treasure Ledger</h2>
        <span className="panel-tag">{captain.portfolioLink}</span>
      </div>
      <p className="panel-intro">
        Track progress without confusing luck for skill. Discipline and risk lead;
        raw return is the by-product.
      </p>

      <div className="metric-grid">
        {PORTFOLIO_METRICS.map((metric) => (
          <PortfolioMetricCard key={metric.key} metric={metric} />
        ))}
      </div>

      <div className="ledger-columns">
        <div className="ledger-positions">
          <h3 className="ledger-subtitle">Positions</h3>
          <div className="position-grid">
            {POSITIONS.map((position) => (
              <PositionCard key={position.ticker} position={position} />
            ))}
          </div>
        </div>
        <div className="ledger-side">
          <AllocationCard />
          <RiskRuleCard />
        </div>
      </div>

      <p className="auth-safety">
        {valuesHidden
          ? "Dollar values and holdings are hidden by your privacy mode. Weights and discipline metrics use percentages only."
          : "Holdings are visible per your privacy mode. We never place trades or connect to a brokerage here."}
      </p>
    </section>
  );
}
