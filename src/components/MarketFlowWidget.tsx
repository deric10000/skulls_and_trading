import { useState } from "react";
import { dataSource } from "../lib/datasource";
import { CaretLeft } from "../lib/icons";
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
  // Selection is local to this read-only home widget (mirrors the read-only
  // WatchlistWidget): picking a step swaps the list for a detail summary.
  const [selected, setSelected] = useState<string | null>(null);
  const marketFlow = dataSource.getMarketFlow();
  const selectedIndex = selected
    ? marketFlow.findIndex((step) => step.key === selected)
    : -1;
  const selectedStep = selectedIndex >= 0 ? marketFlow[selectedIndex] : undefined;

  if (selectedStep) {
    return (
      <section className="panel market-flow" aria-labelledby="flow-title">
        <div className="panel-head">
          <h2 id="flow-title">Market Weather</h2>
          <span className="panel-tag">{selectedStep.label}</span>
        </div>
        <button
          type="button"
          className="breadcrumb flow-breadcrumb"
          onClick={() => setSelected(null)}
        >
          <CaretLeft aria-hidden />
          Market Weather
        </button>
        <div className="flow-summary">
          {FLOW_ART[selectedStep.key] ? (
            <img
              className="flow-summary-art"
              src={FLOW_ART[selectedStep.key]}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <div className="flow-summary-content">
            <header className="flow-summary-head">
              <span className="flow-index">{selectedIndex + 1}</span>
              <span className="flow-summary-titles">
                <span className="flow-label">{selectedStep.label}</span>
                <span className={`flow-detail flow-detail--${selectedStep.tone}`}>
                  {selectedStep.detail}
                </span>
              </span>
            </header>
            <p className="flow-summary-note">{selectedStep.summary}</p>
          </div>
        </div>
      </section>
    );
  }

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
        {marketFlow.map((step, index) => {
          const isActive = step.key === selected;
          return (
            <li
              key={step.key}
              className={
                isActive ? "flow-step select-card is-selected" : "flow-step select-card"
              }
            >
              {FLOW_ART[step.key] ? (
                <img
                  className="flow-step-art"
                  src={FLOW_ART[step.key]}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                className="flow-select"
                onClick={() => setSelected(step.key)}
                aria-pressed={isActive}
              >
                <span className="flow-index">{index + 1}</span>
                <span className="flow-label">{step.label}</span>
                <span className={`flow-detail flow-detail--${step.tone}`}>
                  {step.detail}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
