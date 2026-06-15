import { useEffect, useState } from "react";
import { FUNDAMENTALS, TECHNICAL_SIGNALS } from "../data";
import { FundamentalsCard } from "../components/FundamentalsCard";
import { StrategyForgePanel } from "../components/StrategyForgePanel";
import { StrategyList } from "../components/StrategyList";
import { TechnicalSignalCard } from "../components/TechnicalSignalCard";
import { useAppState } from "../state/AppState";

export function StrategyForgePage() {
  const {
    strategies,
    createStrategy,
    duplicateStrategy,
    resetStrategy,
    deleteStrategy,
  } = useAppState();

  const [selectedId, setSelectedId] = useState<string>(
    strategies[0]?.id ?? "",
  );

  // Keep a valid selection if the selected strategy is removed.
  useEffect(() => {
    if (!strategies.some((strategy) => strategy.id === selectedId)) {
      setSelectedId(strategies[0]?.id ?? "");
    }
  }, [strategies, selectedId]);

  const selectedStrategy = strategies.find(
    (strategy) => strategy.id === selectedId,
  );

  function handleCreate() {
    const id = createStrategy();
    setSelectedId(id);
  }

  function handleDuplicate(id: string) {
    const newId = duplicateStrategy(id);
    if (newId) setSelectedId(newId);
  }

  return (
    <div className="page forge-page">
      <header className="page-head">
        <h1>Strategy Forge</h1>
        <p className="page-subtitle">
          Forge the rules you'll be held to. Define your edge once, then let every
          name be checked against it — not against emotion.
        </p>
      </header>
      <div className="forge-grid">
        <div className="forge-strategies">
          <StrategyList
            strategies={strategies}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={handleCreate}
            onDuplicate={handleDuplicate}
            onReset={resetStrategy}
            onDelete={deleteStrategy}
          />
        </div>

        <div className="forge-config">
          <StrategyForgePanel strategy={selectedStrategy} />
        </div>

        <div className="forge-fundamentals">
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
        </div>

        <div className="forge-technical">
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
        </div>
      </div>
    </div>
  );
}
