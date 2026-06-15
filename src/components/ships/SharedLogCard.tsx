import { SHARED_LOGS } from "../../data";

export function SharedLogCard() {
  return (
    <section className="panel shared-logs" aria-labelledby="shared-logs-title">
      <div className="panel-head">
        <h2 id="shared-logs-title">Shared Logs</h2>
        <span className="panel-tag">Crew shared</span>
      </div>
      <p className="panel-intro">
        Only logs a crew member chose to share appear here. Yours stay private unless
        you share them.
      </p>
      <ul className="shared-log-list">
        {SHARED_LOGS.map((log) => (
          <li key={log.id} className="shared-log-item">
            <div className="shared-log-head">
              <span className="shared-log-author">{log.author}</span>
              <span className="shared-log-time">{log.timestamp}</span>
            </div>
            <p className="shared-log-note">{log.note}</p>
            <span className="chip status--neutral">{log.ship}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
