import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";
import { PORTFOLIOS, TICKER_ANALYSIS, watchlistFromHoldings } from "../data";
import { formatChange, formatPrice } from "../lib/format";
import { STATUS_TONE } from "../lib/status";
import { StatusBadge } from "./StatusBadge";
import { CaretLeft } from "../lib/icons";
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
        {item.shares > 0 ? (
          <span className="watch-holding">
            {item.shares} shares · DCA {formatPrice(item.avgPrice)}
          </span>
        ) : null}
      </header>

      <div className="watch-summary-signal">
        <span className={`chip status--${STATUS_TONE[item.status]}`}>
          {item.status}
        </span>
        <span className="watch-summary-metrics">Conviction {item.conviction}</span>
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
        <div className="watch-summary-row">
          <dt>Why</dt>
          <dd>{item.reason}</dd>
        </div>
        {analysis ? (
          <>
            <div className="watch-summary-row">
              <dt>Setup</dt>
              <dd>{analysis.setupSummary}</dd>
            </div>
            <div className="watch-summary-row">
              <dt>Thesis</dt>
              <dd>{analysis.thesis}</dd>
            </div>
            <div className="watch-summary-row">
              <dt>Risk</dt>
              <dd>{analysis.risk}</dd>
            </div>
          </>
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

const DEFAULT_SOURCE_ID = PORTFOLIOS[0]?.id ?? "";

export function WatchlistWidget({ readOnly = false }: { readOnly?: boolean }) {
  const {
    watchlist,
    selectedTicker,
    selectTicker,
    getSignal,
    logsByTicker,
  } = useAppState();
  const [draft, setDraft] = useState("");
  // Read-only (home) selection is local to this widget so it never mutates the
  // global selected ticker that drives the dashboard. Defaults to none selected.
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  // Which portfolio/watchlist is shown. Portfolios (live-connected accounts) are
  // read-only; only a watchlist can add/remove tickers.
  const [portfolio, setPortfolio] = useState(DEFAULT_SOURCE_ID);
  const selectedSource =
    PORTFOLIOS.find((option) => option.id === portfolio) ?? PORTFOLIOS[0];
  const isWatchlistSource = selectedSource.type === "watchlist";
  const isDefaultSource = selectedSource.id === DEFAULT_SOURCE_ID;

  // A watchlist is user-editable, so its (mock) list lives in local state and is
  // re-seeded whenever the selected source changes — keeps add/remove from
  // mutating the read-only portfolio data.
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(() =>
    watchlistFromHoldings(selectedSource.holdings),
  );
  useEffect(() => {
    if (isWatchlistSource) {
      setWatchlistItems(watchlistFromHoldings(selectedSource.holdings));
    }
  }, [isWatchlistSource, selectedSource]);

  // The list to render: the default portfolio mirrors live app state (so the
  // dashboard stays in sync); a watchlist uses its editable local list; any other
  // portfolio is derived (read-only) from its holdings.
  const items = useMemo<WatchlistItem[]>(() => {
    if (isDefaultSource) return watchlist;
    if (isWatchlistSource) return watchlistItems;
    return watchlistFromHoldings(selectedSource.holdings);
  }, [isDefaultSource, isWatchlistSource, watchlist, watchlistItems, selectedSource]);

  const activeTicker = readOnly ? localSelected : selectedTicker;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (!next) return;
    setWatchlistItems((current) =>
      current.some((item) => item.ticker === next)
        ? current
        : [
            ...current,
            {
              ticker: next,
              name: "New position · Pending research",
              price: 0,
              changePct: 0,
              status: "Thesis Check",
              conviction: 40,
              shares: 0,
              avgPrice: 0,
              reason: "Pending research — assign a strategy and log your thesis.",
            },
          ],
    );
    setDraft("");
  }

  function handleRemove(ticker: string) {
    setWatchlistItems((current) => current.filter((item) => item.ticker !== ticker));
  }

  // Read-only detail view: a condensed, read-only summary of the selected ticker
  // (drawn from the dashboard's signal / analysis / log data, no CRUD).
  const summaryItem =
    readOnly && localSelected
      ? items.find((item) => item.ticker === localSelected)
      : undefined;

  // Snapshot chip reflects the selected source's headline alignment (the list is
  // ordered strongest-first), so switching sources visibly changes the state.
  const snapshotStatus = items[0]?.status ?? "Watch";

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
        <span className="panel-tag">{items.length} names</span>
      </div>
      <div className="portfolio-switcher">
        <label className="visually-hidden" htmlFor="portfolio-select">
          Switch portfolio or watchlist
        </label>
        <select
          id="portfolio-select"
          className="input"
          value={portfolio}
          onChange={(event) => setPortfolio(event.target.value)}
        >
          {PORTFOLIOS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {readOnly ? (
        // Snapshot headline reflects the selected source's lead alignment. The
        // emblem is a static placeholder until driven by live insights.
        <div className="watchlist-snapshot">
          <div className="compass">
            <img className="compass-img" src={bullCompass} alt="" />
          </div>
          <div className="watchlist-snapshot-body">
            <span
              className={`watch-signal watch-signal--${STATUS_TONE[snapshotStatus]}`}
            >
              Strategy Check
            </span>
            <StatusBadge status={snapshotStatus} />
          </div>
        </div>
      ) : isWatchlistSource ? (
        // Only a (user-curated) watchlist can add tickers. Portfolios are
        // live-connected accounts, so their holdings come from the connection.
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
      ) : null}
      <ul className="watchlist-items">
        {items.map((item) => {
          const isActive = item.ticker === activeTicker;
          return (
            <li key={item.ticker}>
              <div
                className={
                  isActive
                    ? "watch-item select-card is-selected"
                    : "watch-item select-card"
                }
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
                  {item.shares > 0 ? (
                    <span className="watch-holding">
                      {item.shares} shares · DCA {formatPrice(item.avgPrice)}
                    </span>
                  ) : null}
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
                  <span
                    className={`watch-signal watch-signal--${STATUS_TONE[item.status]}`}
                  >
                    Strategy Check · {item.status}
                  </span>
                </button>
                {/* Removing names is only valid on a user-curated watchlist.
                    Portfolios are (future) live-connected accounts, so their
                    holdings can't be hand-removed. */}
                {!readOnly && isWatchlistSource ? (
                  <button
                    type="button"
                    className="watch-remove"
                    onClick={() => handleRemove(item.ticker)}
                    aria-label={`Remove ${item.ticker} from watchlist`}
                  >
                    &times;
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="watch-empty">
            No names yet — add a ticker to start this watchlist.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
