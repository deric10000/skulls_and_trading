import { useState } from "react";
import { useAppState } from "../state/AppState";
import { TICKER_ANALYSIS } from "../data";
import { formatChange, formatPrice } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import { CaretLeft, TrendUp } from "../lib/icons";
import type { LogEntry, SignalResult, WatchlistItem } from "../types";
import bullCompass from "../assets/bull-skull-compass.png";

function WatchSummary({
  item,
  signal,
  logs,
}: {
  item: WatchlistItem;
  signal: SignalResult;
  logs: LogEntry[];
}) {
  const analysis = TICKER_ANALYSIS[item.ticker];
  const latestLog = logs[0];

  return (
    <div className="watch-summary">
      <header className="watch-summary-head">
        <div className="watch-summary-title">
          <span className="watch-summary-ticker">{item.ticker}</span>
          <StatusBadge status={item.status} />
        </div>
        <span className="watch-name">{item.name}</span>
        <div className="watch-summary-quote">
          <span className="watch-price">{formatPrice(item.price)}</span>
          <span
            className={
              item.changePct >= 0
                ? "watch-change watch-change--up"
                : "watch-change watch-change--down"
            }
          >
            {formatChange(item.changePct)}
          </span>
        </div>
      </header>

      <div className="watch-summary-signal">
        <span className={`chip status--${signal.tone}`}>{signal.state}</span>
        <span className="watch-summary-metrics">
          Confidence {signal.confidence}% · Conviction {item.conviction}
        </span>
      </div>

      {signal.strategyStack.length > 0 ? (
        <ul className="signal-stack" aria-label="Strategy stack">
          {signal.strategyStack.map((name) => (
            <li key={name} className="chip">
              {name}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="watch-summary-detail">
        {analysis ? (
          <div className="watch-summary-row">
            <dt>Setup</dt>
            <dd>{analysis.setupSummary}</dd>
          </div>
        ) : null}
        <div className="watch-summary-row">
          <dt>Why</dt>
          <dd>{signal.reason}</dd>
        </div>
        <div className="watch-summary-row">
          <dt>Invalidation</dt>
          <dd>{signal.invalidation}</dd>
        </div>
        {analysis ? (
          <div className="watch-summary-row">
            <dt>Thesis</dt>
            <dd>{analysis.thesis}</dd>
          </div>
        ) : null}
        {analysis ? (
          <div className="watch-summary-row">
            <dt>Risk</dt>
            <dd>{analysis.risk}</dd>
          </div>
        ) : null}
      </dl>

      {latestLog ? (
        <div className="watch-summary-log">
          <span className="watch-summary-log-label">
            Captain&rsquo;s Log · {logs.length}
          </span>
          <div className="watch-summary-log-entry">
            <span className="watch-summary-log-title">{latestLog.title}</span>
            <span className="watch-summary-log-time">{latestLog.timestamp}</span>
          </div>
          <p className="watch-summary-log-note">{latestLog.note}</p>
        </div>
      ) : null}
    </div>
  );
}

export function WatchlistWidget({ readOnly = false }: { readOnly?: boolean }) {
  const {
    watchlist,
    selectedTicker,
    selectTicker,
    addTicker,
    removeTicker,
    getSignal,
    logsByTicker,
  } = useAppState();
  const [draft, setDraft] = useState("");
  // Read-only (home) selection is local to this widget so it never mutates the
  // global selected ticker that drives the dashboard. Defaults to none selected.
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const activeTicker = readOnly ? localSelected : selectedTicker;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    if (next) {
      addTicker(next);
      setDraft("");
    }
  }

  // Read-only detail view: a condensed, read-only summary of the selected ticker
  // (drawn from the dashboard's signal / analysis / log data, no CRUD).
  const summaryItem =
    readOnly && localSelected
      ? watchlist.find((item) => item.ticker === localSelected)
      : undefined;

  if (summaryItem) {
    return (
      <section className="panel watchlist" aria-labelledby="watchlist-title">
        <div className="panel-head">
          <h2 id="watchlist-title">Current Watch</h2>
          <span className="panel-tag">{summaryItem.ticker}</span>
        </div>
        <button
          type="button"
          className="breadcrumb watchlist-breadcrumb"
          onClick={() => setLocalSelected(null)}
        >
          <CaretLeft aria-hidden />
          Current Watch
        </button>
        <WatchSummary
          item={summaryItem}
          signal={getSignal(summaryItem.ticker)}
          logs={logsByTicker[summaryItem.ticker] ?? []}
        />
      </section>
    );
  }

  return (
    <section className="panel watchlist" aria-labelledby="watchlist-title">
      <div className="panel-head">
        <h2 id="watchlist-title">Current Watch</h2>
        <span className="panel-tag">{watchlist.length} names</span>
      </div>
      {readOnly ? (
        // Static placeholder snapshot — the emblem + chip will be driven by live
        // alignment insights in a future iteration.
        <div className="watchlist-snapshot">
          <div className="compass">
            <img className="compass-img" src={bullCompass} alt="" />
          </div>
          <div className="watchlist-snapshot-body">
            <span className="watch-signal watch-signal--positive">Strategy Check</span>
            <span className="chip status--positive">
              <TrendUp aria-hidden />
              High Alignment
            </span>
          </div>
        </div>
      ) : (
        <form className="watchlist-add" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="add-ticker">
            Add a ticker
          </label>
          <input
            id="add-ticker"
            className="input"
            placeholder="Add ticker (e.g. TSLA)"
            value={draft}
            maxLength={6}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="btn btn--small">
            Add
          </button>
        </form>
      )}
      <ul className="watchlist-items">
        {watchlist.map((item) => {
          const isActive = item.ticker === activeTicker;
          const signal = getSignal(item.ticker);
          return (
            <li key={item.ticker}>
              <div
                className={isActive ? "watch-item watch-item--active" : "watch-item"}
              >
                <button
                  type="button"
                  className="watch-select"
                  onClick={() =>
                    readOnly
                      ? setLocalSelected(item.ticker)
                      : selectTicker(item.ticker)
                  }
                  aria-pressed={isActive}
                >
                  <span className="watch-top">
                    <span className="watch-ticker">
                      {isActive ? (
                        <span className="watch-selected-dot" aria-hidden="true" />
                      ) : null}
                      {item.ticker}
                    </span>
                    <StatusBadge status={item.status} />
                  </span>
                  <span className="watch-name">{item.name}</span>
                  <span className="watch-bottom">
                    <span className="watch-price">{formatPrice(item.price)}</span>
                    <span
                      className={
                        item.changePct >= 0
                          ? "watch-change watch-change--up"
                          : "watch-change watch-change--down"
                      }
                    >
                      {formatChange(item.changePct)}
                    </span>
                  </span>
                  <span className="conviction">
                    <span className="conviction-track">
                      <span
                        className="conviction-fill"
                        style={{ width: `${item.conviction}%` }}
                      />
                    </span>
                    <span className="conviction-label">
                      Conviction {item.conviction}
                    </span>
                  </span>
                  <span className={`watch-signal watch-signal--${signal.tone}`}>
                    Strategy Check · {signal.state}
                  </span>
                </button>
                {readOnly ? null : (
                  <button
                    type="button"
                    className="watch-remove"
                    onClick={() => removeTicker(item.ticker)}
                    aria-label={`Remove ${item.ticker} from watchlist`}
                  >
                    &times;
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
