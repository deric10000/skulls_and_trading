import { useState } from "react";
import { useAppState } from "../state/AppState";

export function StrategyAssignmentWidget() {
  const {
    selectedItem,
    selectedTicker,
    strategies,
    strategyIdsFor,
    assignStrategy,
    unassignStrategy,
    setActivePage,
  } = useAppState();
  const [pick, setPick] = useState("");

  if (!selectedItem) {
    return (
      <section className="panel strategy-assign" aria-labelledby="assign-title">
        <div className="panel-head">
          <h2 id="assign-title">Strategy Assignment</h2>
        </div>
        <p className="assign-empty">Select a ticker to assign strategies.</p>
      </section>
    );
  }

  const assignedIds = strategyIdsFor(selectedTicker);
  const assigned = strategies.filter((strategy) => assignedIds.includes(strategy.id));
  const available = strategies.filter(
    (strategy) => !assignedIds.includes(strategy.id),
  );

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pick) {
      assignStrategy(selectedTicker, pick);
      setPick("");
    }
  }

  return (
    <section className="panel strategy-assign" aria-labelledby="assign-title">
      <div className="panel-head">
        <h2 id="assign-title">Strategy Assignment</h2>
        <span className="panel-tag">{selectedTicker}</span>
      </div>
      <p className="panel-intro">
        Assign strategies to {selectedTicker}. Changes update the signal above.
      </p>

      {assigned.length > 0 ? (
        <ul className="assign-list">
          {assigned.map((strategy) => (
            <li key={strategy.id} className="assign-row">
              <span className="assign-name">{strategy.name}</span>
              <button
                type="button"
                className="assign-remove"
                onClick={() => unassignStrategy(selectedTicker, strategy.id)}
                aria-label={`Remove ${strategy.name} from ${selectedTicker}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="assign-empty">No strategies assigned yet.</p>
      )}

      <form className="assign-add" onSubmit={handleAdd}>
        <label className="visually-hidden" htmlFor="assign-select">
          Add strategy
        </label>
        <select
          id="assign-select"
          className="input"
          value={pick}
          onChange={(event) => setPick(event.target.value)}
        >
          <option value="">Add strategy…</option>
          {available.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>
              {strategy.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn--small" disabled={!pick}>
          Add
        </button>
      </form>

      <button
        type="button"
        className="btn btn--ghost btn--small assign-forge-link"
        onClick={() => setActivePage("strategy-forge")}
      >
        View strategy details
      </button>
    </section>
  );
}
