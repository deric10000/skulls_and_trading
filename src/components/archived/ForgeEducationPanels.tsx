import { FUNDAMENTALS, TECHNICAL_SIGNALS } from "../../data";
import { FundamentalsCard } from "../FundamentalsCard";
import { TechnicalSignalCard } from "../TechnicalSignalCard";

// ARCHIVED (not rendered anywhere) — the two "education" panels that used to sit
// on the Strategy Forge page (Fundamentals / Investor lens + Reading the signals
// / Trader lens). Parked here intact so they can be dropped back in later. See
// StrategyForgePage for where these were removed during the layout redesign.
export function ForgeFundamentalsPanel() {
  return (
    <section className="panel education" aria-labelledby="fundamentals-title">
      <div className="panel-head">
        <h2 id="fundamentals-title">Fundamentals</h2>
        <span className="panel-tag">Investor lens</span>
      </div>
      <p className="panel-intro">
        The building blocks of a company thesis, in plain English. Use these to
        decide which fundamental inputs your strategies should weigh.
      </p>
      <div className="card-stack">
        {FUNDAMENTALS.map((card) => (
          <FundamentalsCard key={card.title} card={card} />
        ))}
      </div>
    </section>
  );
}

export function ForgeTechnicalPanel() {
  return (
    <section className="panel education" aria-labelledby="indicators-title">
      <div className="panel-head">
        <h2 id="indicators-title">Reading the signals</h2>
        <span className="panel-tag">Trader lens</span>
      </div>
      <p className="panel-intro">
        The technical tools traders check before acting. Pair them with the
        thesis, never in isolation.
      </p>
      <div className="card-stack">
        {TECHNICAL_SIGNALS.map((card) => (
          <TechnicalSignalCard key={card.title} card={card} />
        ))}
      </div>
    </section>
  );
}
