import { useAppState } from "../state/AppState";

export function SignalWidget() {
  const { selectedItem, selectedSignal } = useAppState();

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

  const signal = selectedSignal;

  return (
    <section className="panel signal-widget" aria-labelledby="signal-title">
      <div className="panel-head">
        <h2 id="signal-title">Strategy Check</h2>
        <span className="panel-tag">Rule check · {selectedItem.ticker}</span>
      </div>

      <div className="signal-headline">
        <span className={`signal-state signal-state--${signal.tone}`}>
          {signal.state}
        </span>
        <div className="signal-confidence">
          <span className="signal-confidence-label">
            Confidence {signal.confidence}%
          </span>
          <span className="conviction-track">
            <span
              className={`conviction-fill conviction-fill--${signal.tone}`}
              style={{ width: `${signal.confidence}%` }}
            />
          </span>
        </div>
      </div>

      {signal.strategyStack.length > 0 ? (
        <ul className="signal-stack" aria-label="Strategy stack">
          {signal.strategyStack.map((name) => (
            <li key={name} className="chip">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="signal-empty">
          No strategies assigned. Assign strategies on the right to drive this
          signal.
        </p>
      )}

      <dl className="signal-detail">
        <div className="signal-detail-row">
          <dt>Why</dt>
          <dd>{signal.reason}</dd>
        </div>
        <div className="signal-detail-row">
          <dt>Invalidation</dt>
          <dd>{signal.invalidation}</dd>
        </div>
        <div className="signal-detail-row">
          <dt>Next level</dt>
          <dd>{signal.nextLevel}</dd>
        </div>
      </dl>
    </section>
  );
}
