import { useAppState } from "../state/AppState";

export function CaptainLogWidget() {
  const { selectedTicker, logsByTicker } = useAppState();
  const entries = selectedTicker ? logsByTicker[selectedTicker] ?? [] : [];

  return (
    <section className="panel captain-log" aria-labelledby="log-title">
      <div className="panel-head">
        <h2 id="log-title">Captain's Log</h2>
        <span className="panel-tag">{selectedTicker || "—"}</span>
      </div>
      {entries.length > 0 ? (
        <ul className="log-list">
          {entries.map((entry) => (
            <li key={entry.id} className="log-card">
              <div className="log-card-head">
                <span className="log-card-title">{entry.title}</span>
                <span className="log-timestamp">{entry.timestamp}</span>
              </div>
              {entry.strategy ? (
                <span className="chip log-strategy">{entry.strategy}</span>
              ) : null}
              <p className="log-card-note">{entry.note}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="log-empty">
          No log entry for <strong>{selectedTicker || "this ticker"}</strong> yet.
          Start the thesis: why you're watching, what would change your mind, and
          your next action.
        </p>
      )}
    </section>
  );
}
