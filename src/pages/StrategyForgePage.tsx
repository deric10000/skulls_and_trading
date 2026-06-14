import { FUNDAMENTALS, TECHNICAL_SIGNALS } from "../data";
import { FundamentalsCard } from "../components/FundamentalsCard";
import { TechnicalSignalCard } from "../components/TechnicalSignalCard";
import { useAppState } from "../state/AppState";

export function StrategyForgePage() {
  const { strategies } = useAppState();

  return (
    <div className="page forge-page">
      <section className="panel strategy">
        <div className="panel-head">
          <h2>Strategy Forge</h2>
          <span className="panel-tag chip--soon">Preview</span>
        </div>
        <p className="panel-intro">
          Manage default and custom strategies here, then assign them to tickers
          from the Dashboard. The full list, editor, and configuration panel land
          in the next phase.
        </p>
        <div className="card-grid">
          {strategies.map((strategy) => (
            <article key={strategy.id} className="edu-card">
              <h3>{strategy.name}</h3>
              <p>{strategy.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="support-grid">
        <section className="panel education" aria-labelledby="fundamentals-title">
          <div className="panel-head">
            <h2 id="fundamentals-title">Fundamentals, in plain English</h2>
            <span className="panel-tag">Investor lens</span>
          </div>
          <p className="panel-intro">
            The building blocks of a company thesis. Soon, these will be AI-assisted
            explanations tuned to the selected ticker.
          </p>
          <div className="card-grid">
            {FUNDAMENTALS.map((card) => (
              <FundamentalsCard key={card.title} card={card} />
            ))}
          </div>
        </section>

        <section className="panel education" aria-labelledby="indicators-title">
          <div className="panel-head">
            <h2 id="indicators-title">Reading the signals</h2>
            <span className="panel-tag">Trader lens</span>
          </div>
          <p className="panel-intro">
            The technical tools traders check before acting. Pair them with the
            thesis, never in isolation.
          </p>
          <div className="card-grid">
            {TECHNICAL_SIGNALS.map((card) => (
              <TechnicalSignalCard key={card.title} card={card} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
