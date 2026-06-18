import { MARKET_FLOW } from "../data";
import marketArt from "../assets/market-flow-market.png";
import sectorArt from "../assets/market-flow-sector.png";
import industryArt from "../assets/market-flow-industry.png";
import stockArt from "../assets/market-flow-stock.png";

const FLOW_ART: Record<string, string> = {
  market: marketArt,
  sector: sectorArt,
  industry: industryArt,
  stock: stockArt,
};

export function MarketFlowWidget() {
  return (
    <section className="panel market-flow" aria-labelledby="flow-title">
      <div className="panel-head">
        <h2 id="flow-title">Market Weather</h2>
        <span className="panel-tag">Macro to micro</span>
      </div>
      <p className="panel-intro">
        Read the conditions before you sail. Is your name moving alone, or with the
        weather behind it? Work it from the top down.
      </p>
      <ol className="flow-steps flow-steps--vertical">
        {MARKET_FLOW.map((step, index) => (
          <li key={step.key} className="flow-step">
            {FLOW_ART[step.key] ? (
              <img className="flow-step-art" src={FLOW_ART[step.key]} alt="" aria-hidden="true" />
            ) : null}
            <span className="flow-index">{index + 1}</span>
            <span className="flow-label">{step.label}</span>
            <span className={`flow-detail flow-detail--${step.tone}`}>
              {step.detail}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
