import { MARKET_FLOW } from "../data";

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
