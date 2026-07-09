import { useAppState } from "../state/AppState";
import { dataSource } from "../lib/datasource";
import { statusCopy } from "../lib/forge/status";
import { STATUS_TONE } from "../lib/status";
import { WatchAlignStack } from "./StatusBadge";

const DEFAULT_PORTFOLIO_ID = dataSource.getPortfolios()[0]?.id ?? "deric";

export function SignalWidget() {
  const {
    selectedItem,
    selectedTicker,
    getStockAlignment,
    getAppliedStrategiesForTicker,
  } = useAppState();

  if (!selectedItem) {
    return (
      <section className="panel signal-widget" aria-labelledby="signal-title">
        <div className="panel-head">
          <h2 id="signal-title">Strategy Check</h2>
          <span className="panel-tag">Rule check</span>
        </div>
        <p className="signal-empty">
          Select a name to check it against your own strategy rules.
        </p>
      </section>
    );
  }

  const alignment = getStockAlignment(DEFAULT_PORTFOLIO_ID, selectedTicker);
  const resolved = alignment?.resolved ?? {
    primary: selectedItem.status,
    categoryFlags: [],
    baseBand: selectedItem.status,
    conviction: selectedItem.conviction,
  };
  const tone = STATUS_TONE[resolved.primary];
  const strategies = getAppliedStrategiesForTicker(selectedTicker);
  const copy = statusCopy(resolved.primary);

  return (
    <section className="panel signal-widget" aria-labelledby="signal-title">
      <div className="panel-head">
        <h2 id="signal-title">Strategy Check</h2>
        <span className="panel-tag">Rule check · {selectedItem.ticker}</span>
      </div>

      <div className="signal-headline">
        <WatchAlignStack resolved={resolved} fallbackStatus={selectedItem.status} />
        <div className="signal-confidence">
          <span className="signal-confidence-label">
            Conviction {resolved.conviction}%
          </span>
          <span className="conviction-track">
            <span
              className={`conviction-fill conviction-fill--${tone}`}
              style={{ width: `${resolved.conviction}%` }}
            />
          </span>
        </div>
      </div>

      {strategies.length > 0 ? (
        <ul className="signal-stack" aria-label="Strategy stack">
          {strategies.map((strategy) => (
            <li key={strategy.id} className="chip">
              {strategy.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="signal-empty">
          No strategies assigned. Assign strategies via holdings in Strategy
          Forge to drive this check.
        </p>
      )}

      <dl className="signal-detail">
        <div className="signal-detail-row">
          <dt>Why</dt>
          <dd>{copy.reason}</dd>
        </div>
        <div className="signal-detail-row">
          <dt>Invalidation</dt>
          <dd>{copy.invalidation}</dd>
        </div>
        <div className="signal-detail-row">
          <dt>Next level</dt>
          <dd>{copy.nextLevel}</dd>
        </div>
      </dl>
    </section>
  );
}
