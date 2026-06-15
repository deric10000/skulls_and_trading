import { Fragment } from "react";
import { MARKET_FLOW } from "../data";

export function MarketFlowBar() {
  return (
    <section className="panel market-flow-bar" aria-label="Market Weather">
      <span className="market-flow-bar-title">Market Weather</span>
      <ol className="market-flow-bar-steps">
        {MARKET_FLOW.map((step, index) => (
          <Fragment key={step.key}>
            <li className="market-flow-bar-step">
              <span className="market-flow-bar-label">{step.label}</span>
              <span className={`market-flow-bar-detail flow-detail--${step.tone}`}>
                {step.detail}
              </span>
            </li>
            {index < MARKET_FLOW.length - 1 ? (
              <li className="market-flow-bar-arrow" aria-hidden="true">
                &rarr;
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>
    </section>
  );
}
