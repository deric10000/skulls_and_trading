import { useAppState } from "../state/AppState";
import { dataSource } from "../lib/datasource";

const DEFAULT_PORTFOLIO_ID = dataSource.getPortfolios()[0]?.id ?? "deric";

export function StrategyAssignmentWidget() {
  const {
    selectedItem,
    selectedTicker,
    getAppliedStrategiesForTicker,
    setActivePage,
  } = useAppState();

  if (!selectedItem) {
    return (
      <section className="panel strategy-assign" aria-labelledby="assign-title">
        <div className="panel-head">
          <h2 id="assign-title">Strategy Assignment</h2>
        </div>
        <p className="assign-empty">Select a ticker to view assigned strategies.</p>
      </section>
    );
  }

  const assigned = getAppliedStrategiesForTicker(
    selectedTicker,
    DEFAULT_PORTFOLIO_ID,
  );

  return (
    <section className="panel strategy-assign" aria-labelledby="assign-title">
      <div className="panel-head">
        <h2 id="assign-title">Strategy Assignment</h2>
        <span className="panel-tag">{selectedTicker}</span>
      </div>
      <p className="panel-intro">
        Strategies applied to {selectedTicker} via portfolio holdings and Forge
        application. The Strategy Check above reflects Forge alignment against
        these rules.
      </p>

      {assigned.length > 0 ? (
        <ul className="assign-list">
          {assigned.map((strategy) => (
            <li key={strategy.id} className="assign-row">
              <span className="assign-name">{strategy.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="assign-empty">No strategies assigned yet.</p>
      )}

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
