import { TICKER_ANALYSIS } from "../data";
import { useAppState } from "../state/AppState";
import { formatChange, formatPrice } from "../lib/format";
import type { SignalChip } from "../types";
import { StatusBadge } from "./StatusBadge";

function SignalChips({ signals }: { signals: SignalChip[] }) {
  return (
    <ul className="signal-chips" aria-label="Signals">
      {signals.map((signal) => (
        <li key={signal.label} className={`chip signal signal--${signal.tone}`}>
          {signal.label}
        </li>
      ))}
    </ul>
  );
}

export function StockSummaryPanel() {
  const { selectedItem } = useAppState();

  if (!selectedItem) {
    return (
      <section className="panel analysis" aria-labelledby="analysis-title">
        <div className="panel-head">
          <h2 id="analysis-title">Stock summary</h2>
        </div>
        <p className="empty-analysis">
          Select a ticker from the Watchlist to load its summary.
        </p>
      </section>
    );
  }

  const analysis = TICKER_ANALYSIS[selectedItem.ticker];

  return (
    <section className="panel analysis" aria-labelledby="analysis-title">
      <div className="analysis-head">
        <div>
          <p className="panel-tag">Selected</p>
          <h2 id="analysis-title" className="analysis-ticker">
            {selectedItem.ticker}
          </h2>
          <p className="analysis-name">{selectedItem.name}</p>
        </div>
        <div className="analysis-quote">
          <span className="analysis-price">{formatPrice(selectedItem.price)}</span>
          <span
            className={
              selectedItem.changePct >= 0
                ? "analysis-change analysis-change--up"
                : "analysis-change analysis-change--down"
            }
          >
            {formatChange(selectedItem.changePct)}
          </span>
          <StatusBadge status={selectedItem.status} />
        </div>
      </div>

      {analysis ? (
        <>
          <p className="analysis-summary">{analysis.setupSummary}</p>
          <SignalChips signals={analysis.signals} />
          <div className="analysis-cards">
            <article className="mini-card">
              <h3>Thesis</h3>
              <p>{analysis.thesis}</p>
            </article>
            <article className="mini-card mini-card--risk">
              <h3>Risk</h3>
              <p>{analysis.risk}</p>
            </article>
            <article className="mini-card">
              <h3>Catalyst</h3>
              <p>{analysis.catalyst}</p>
            </article>
          </div>
          <div className="lens-grid">
            <article className="lens-card">
              <h3 className="lens-title">Investor view</h3>
              <p className="lens-question">Why does this company matter?</p>
              <p>{analysis.investorView}</p>
            </article>
            <article className="lens-card lens-card--trader">
              <h3 className="lens-title">Trader view</h3>
              <p className="lens-question">What do I need before I act?</p>
              <p>{analysis.traderView}</p>
            </article>
          </div>
        </>
      ) : (
        <div className="empty-analysis">
          <p>
            No deep analysis loaded for <strong>{selectedItem.ticker}</strong> yet.
            Investor and trader briefings are generated for tracked names as the
            thesis develops.
          </p>
        </div>
      )}
    </section>
  );
}
