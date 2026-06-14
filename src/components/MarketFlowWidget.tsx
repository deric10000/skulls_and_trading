import { MARKET_FLOW } from "../data";

export function MarketFlowWidget() {
  return (
    <section className="panel market-flow" aria-labelledby="flow-title">
      <div className="panel-head">
        <h2 id="flow-title">Top-down market flow</h2>
        <span className="panel-tag">Macro to micro</span>
      </div>
      <p className="panel-intro">
        Is the stock moving alone, or with the market behind it? Read it from the
        top down.
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
