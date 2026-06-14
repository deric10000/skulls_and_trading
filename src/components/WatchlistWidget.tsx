import { useState } from "react";
import { useAppState } from "../state/AppState";
import { formatChange, formatPrice } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

export function WatchlistWidget() {
  const { watchlist, selectedTicker, selectTicker, addTicker, removeTicker } =
    useAppState();
  const [draft, setDraft] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    if (next) {
      addTicker(next);
      setDraft("");
    }
  }

  return (
    <section className="panel watchlist" aria-labelledby="watchlist-title">
      <div className="panel-head">
        <h2 id="watchlist-title">Watchlist</h2>
        <span className="panel-tag">{watchlist.length} names</span>
      </div>
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
      <ul className="watchlist-items">
        {watchlist.map((item) => {
          const isActive = item.ticker === selectedTicker;
          return (
            <li key={item.ticker}>
              <div
                className={isActive ? "watch-item watch-item--active" : "watch-item"}
              >
                <button
                  type="button"
                  className="watch-select"
                  onClick={() => selectTicker(item.ticker)}
                  aria-pressed={isActive}
                >
                  <span className="watch-top">
                    <span className="watch-ticker">{item.ticker}</span>
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
                </button>
                <button
                  type="button"
                  className="watch-remove"
                  onClick={() => removeTicker(item.ticker)}
                  aria-label={`Remove ${item.ticker} from watchlist`}
                >
                  &times;
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
