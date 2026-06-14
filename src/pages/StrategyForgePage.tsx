import { FUNDAMENTALS, TECHNICAL_SIGNALS } from "../data";
import { FundamentalsCard } from "../components/FundamentalsCard";
import { TechnicalSignalCard } from "../components/TechnicalSignalCard";
import { useAppState } from "../state/AppState";

export function StrategyForgePage() {
  const { strategies } = useAppState();

  return (
    <div className="page forge-page">
      <div className="grid-12 forge-grid">
        <section className="panel education col-3" aria-labelledby="fundamentals-title">
          <div className="panel-head">
            <h2 id="fundamentals-title">Fundamentals</h2>
            <span className="panel-tag">Investor lens</span>
          </div>
          <p className="panel-intro">
            The building blocks of a company thesis, in plain English.
          </p>
          <div className="card-stack">
            {FUNDAMENTALS.map((card) => (
              <FundamentalsCard key={card.title} card={card} />
            ))}
          </div>
        </section>

        <section className="panel education col-3" aria-labelledby="indicators-title">
          <div className="panel-head">
            <h2 id="indicators-title">Reading the signals</h2>
            <span className="panel-tag">Trader lens</span>
          </div>
          <p className="panel-intro">
            The technical tools traders check before acting.
          </p>
          <div className="card-stack">
            {TECHNICAL_SIGNALS.map((card) => (
              <TechnicalSignalCard key={card.title} card={card} />
            ))}
          </div>
        </section>

        <section className="panel strategy col-6" aria-labelledby="forge-title">
          <div className="panel-head">
            <h2 id="forge-title">Strategy Forge</h2>
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
      </div>
    </div>
  );
}
