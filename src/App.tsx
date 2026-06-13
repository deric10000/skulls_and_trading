import { useMemo, useState } from "react";
import {
  INITIAL_WATCHLIST,
  LOG_ENTRIES,
  TICKER_ANALYSIS,
} from "./data";
import type {
  LogEntry,
  SectionId,
  SignalChip,
  StatusType,
  TickerAnalysis,
  WatchlistItem,
} from "./types";

const NAV_ITEMS: { id: SectionId; label: string; href: string }[] = [
  { id: "home", label: "Home", href: "#home" },
  { id: "dashboard", label: "Dashboard", href: "#dashboard" },
  { id: "watchlist", label: "Watchlist", href: "#watchlist" },
  { id: "strategy", label: "Strategy", href: "#strategy" },
  { id: "log", label: "Captain's Log", href: "#log" },
  { id: "signals", label: "Signals", href: "#signals" },
];

const STATUS_TONE: Record<StatusType, string> = {
  Bullish: "status--positive",
  Breakout: "status--positive",
  Watching: "status--neutral",
  Caution: "status--warning",
  Pullback: "status--negative",
};

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatChange(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function StatusChip({ status }: { status: StatusType }) {
  return <span className={`chip ${STATUS_TONE[status]}`}>{status}</span>;
}

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

function Header({ activeSection }: { activeSection: SectionId }) {
  return (
    <header className="site-header">
      <a className="brand" href="#home">
        <span className="brand-mark" aria-hidden="true">
          &#9763;
        </span>
        <span className="brand-text">
          Skulls <span className="brand-amp">&amp;</span> Trading
        </span>
      </a>
      <nav className="site-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={
              item.id === activeSection ? "nav-link nav-link--active" : "nav-link"
            }
            aria-current={item.id === activeSection ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="home" className="hero" aria-labelledby="hero-title">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-content">
        <p className="eyebrow">A command center for aggressive investors and traders</p>
        <h1 id="hero-title">
          Command your watchlist before the market commands you.
        </h1>
        <p className="lede">
          A dark-mode trading command center for tracking high-conviction stocks,
          reading the setup, and logging the thesis before you act.
        </p>
        <div className="hero-actions">
          <a className="btn btn--primary" href="#dashboard">
            Open the Dashboard
          </a>
          <a className="btn btn--ghost" href="#watchlist">
            View Watchlist
          </a>
        </div>
        <dl className="hero-stats">
          <div className="hero-stat">
            <dt>Conviction tracked</dt>
            <dd>6 names</dd>
          </div>
          <div className="hero-stat">
            <dt>Lenses</dt>
            <dd>Investor + Trader</dd>
          </div>
          <div className="hero-stat">
            <dt>Discipline</dt>
            <dd>Captain's Log</dd>
          </div>
        </dl>
      </div>
      <aside className="hero-preview" aria-hidden="true">
        <div className="compass">
          <div className="compass-ring" />
          <div className="compass-needle" />
          <span className="compass-label">Market Compass</span>
        </div>
        <div className="hero-preview-card">
          <span className="chip status--positive">Signal Deck</span>
          <p>Trend, volume, and catalyst aligned on the leaders.</p>
        </div>
      </aside>
    </section>
  );
}

function WatchlistPanel({
  watchlist,
  selectedTicker,
  onSelect,
  onAdd,
  onRemove,
}: {
  watchlist: WatchlistItem[];
  selectedTicker: string;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (next) {
      onAdd(next);
      setDraft("");
    }
  }

  return (
    <section id="watchlist" className="panel watchlist" aria-labelledby="watchlist-title">
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
                  onClick={() => onSelect(item.ticker)}
                  aria-pressed={isActive}
                >
                  <span className="watch-top">
                    <span className="watch-ticker">{item.ticker}</span>
                    <StatusChip status={item.status} />
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
                  onClick={() => onRemove(item.ticker)}
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

function AnalysisPanel({
  item,
  analysis,
}: {
  item: WatchlistItem;
  analysis: TickerAnalysis | undefined;
}) {
  return (
    <section id="dashboard" className="panel analysis" aria-labelledby="analysis-title">
      <div className="analysis-head">
        <div>
          <p className="panel-tag">Selected</p>
          <h2 id="analysis-title" className="analysis-ticker">
            {item.ticker}
          </h2>
          <p className="analysis-name">{item.name}</p>
        </div>
        <div className="analysis-quote">
          <span className="analysis-price">{formatPrice(item.price)}</span>
          <span
            className={
              item.changePct >= 0
                ? "analysis-change analysis-change--up"
                : "analysis-change analysis-change--down"
            }
          >
            {formatChange(item.changePct)}
          </span>
          <StatusChip status={item.status} />
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
            No deep analysis loaded for <strong>{item.ticker}</strong> yet. Investor
            and trader briefings are generated for tracked names as the thesis develops.
          </p>
        </div>
      )}
    </section>
  );
}

const INDICATOR_TAGS = [
  "RSI",
  "VWAP",
  "Volume",
  "Moving Averages",
  "Support",
  "Resistance",
  "Trend",
];

function ChartPlaceholder({ ticker }: { ticker: string }) {
  return (
    <section className="panel chart" aria-labelledby="chart-title">
      <div className="panel-head">
        <h2 id="chart-title">{ticker} · Chart</h2>
        <span className="panel-tag">Placeholder</span>
      </div>
      <div className="chart-frame" role="img" aria-label={`Illustrative price chart for ${ticker}`}>
        <div className="chart-grid" aria-hidden="true" />
        <div className="chart-line" aria-hidden="true" />
        <div className="chart-volume" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, index) => (
            <span
              key={index}
              className="chart-bar"
              style={{ height: `${20 + ((index * 37) % 70)}%` }}
            />
          ))}
        </div>
      </div>
      <ul className="indicator-tags" aria-label="Indicators on watch">
        {INDICATOR_TAGS.map((tag) => (
          <li key={tag} className="chip indicator-tag">
            {tag}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CaptainLog({ ticker, entry }: { ticker: string; entry: LogEntry | undefined }) {
  return (
    <section id="log" className="panel captain-log" aria-labelledby="log-title">
      <div className="panel-head">
        <h2 id="log-title">Captain's Log</h2>
        <span className="panel-tag">{ticker}</span>
      </div>
      {entry ? (
        <div className="log-body">
          <p className="log-timestamp">{entry.timestamp}</p>
          <dl className="log-entries">
            <div className="log-row">
              <dt>Why I'm watching</dt>
              <dd>{entry.whyWatching}</dd>
            </div>
            <div className="log-row">
              <dt>What changed</dt>
              <dd>{entry.whatChanged}</dd>
            </div>
            <div className="log-row">
              <dt>What would invalidate this</dt>
              <dd>{entry.invalidation}</dd>
            </div>
            <div className="log-row">
              <dt>Next action</dt>
              <dd>{entry.nextAction}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="log-body">
          <p className="log-empty">
            No log entry for <strong>{ticker}</strong> yet. Start the thesis: why you're
            watching, what would change your mind, and your next action.
          </p>
        </div>
      )}
    </section>
  );
}

const FUNDAMENTALS = [
  {
    title: "Business Model",
    body: "How the company makes money and whether that model can scale.",
  },
  {
    title: "Revenue Growth",
    body: "Whether demand is expanding, slowing, or becoming less predictable.",
  },
  {
    title: "Profitability",
    body: "Whether the company turns growth into earnings or is still burning cash.",
  },
  {
    title: "Competitive Edge",
    body: "What protects the business and whether the moat is widening or eroding.",
  },
  {
    title: "Balance Sheet",
    body: "Cash, debt, and staying power if conditions get harder.",
  },
  {
    title: "Valuation",
    body: "Whether expectations already look priced in.",
  },
  {
    title: "Risk Factors",
    body: "What could break the thesis, from execution to macro pressure.",
  },
];

function FundamentalEducation() {
  return (
    <section className="panel education" aria-labelledby="fundamentals-title">
      <div className="panel-head">
        <h2 id="fundamentals-title">Fundamentals, in plain English</h2>
        <span className="panel-tag">Investor lens</span>
      </div>
      <p className="panel-intro">
        The building blocks of a company thesis. Soon, these will be AI-assisted
        explanations tuned to the selected ticker.
      </p>
      <div className="card-grid">
        {FUNDAMENTALS.map((card) => (
          <article key={card.title} className="edu-card">
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const INDICATORS = [
  {
    title: "RSI",
    body: "Measures momentum and whether a stock may be stretched, cooling, or gaining strength.",
  },
  {
    title: "VWAP",
    body: "The average price weighted by volume. Traders use it to judge intraday strength or weakness.",
  },
  {
    title: "Moving Averages",
    body: "Help identify trend direction, support, resistance, and potential momentum shifts.",
  },
  {
    title: "Volume",
    body: "Shows participation. Moves on stronger volume can carry more weight than thin moves.",
  },
];

function IndicatorEducation() {
  return (
    <section id="signals" className="panel education" aria-labelledby="indicators-title">
      <div className="panel-head">
        <h2 id="indicators-title">Reading the signals</h2>
        <span className="panel-tag">Trader lens</span>
      </div>
      <p className="panel-intro">
        The technical tools traders check before acting. Pair them with the thesis,
        never in isolation.
      </p>
      <div className="card-grid">
        {INDICATORS.map((card) => (
          <article key={card.title} className="edu-card">
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const STRATEGY_FIELDS = [
  { label: "Timeframe", options: ["Swing", "Long-term", "Speculative"] },
  {
    label: "Style",
    options: ["Aggressive Growth", "Momentum", "Turnaround", "AI Infrastructure"],
  },
  {
    label: "Required Signals",
    options: ["Trend", "Volume", "Catalyst", "Risk / Reward"],
  },
  {
    label: "Exit Logic",
    options: ["Break thesis", "Lose trend", "Hit target", "Macro changes"],
  },
];

function StrategyBuilderPreview() {
  return (
    <section id="strategy" className="panel strategy" aria-labelledby="strategy-title">
      <div className="panel-head">
        <h2 id="strategy-title">Strategy Forge</h2>
        <span className="panel-tag chip--soon">Preview</span>
      </div>
      <p className="panel-intro">
        Combine investor conviction with trader signals into a repeatable plan.
        Wiring comes later; the shape of the decision is here now.
      </p>
      <div className="strategy-grid">
        {STRATEGY_FIELDS.map((field) => (
          <article key={field.label} className="strategy-field">
            <h3>{field.label}</h3>
            <ul>
              {field.options.map((option, index) => (
                <li
                  key={option}
                  className={index === 0 ? "strategy-option strategy-option--on" : "strategy-option"}
                >
                  {option}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

const MARKET_FLOW = [
  { label: "Macro Market", detail: "SPY · NASDAQ · Dow" },
  { label: "Sector", detail: "Technology strength" },
  { label: "Industry", detail: "Semiconductors trend" },
  { label: "Stock", detail: "Selected ticker setup" },
];

function MarketFlowPreview() {
  return (
    <section className="panel market-flow" aria-labelledby="flow-title">
      <div className="panel-head">
        <h2 id="flow-title">Top-down market flow</h2>
        <span className="panel-tag chip--soon">Preview</span>
      </div>
      <p className="panel-intro">
        Is the stock moving alone, or with the market behind it? Read it from the top down.
      </p>
      <ol className="flow-steps">
        {MARKET_FLOW.map((step, index) => (
          <li key={step.label} className="flow-step">
            <span className="flow-index">{index + 1}</span>
            <span className="flow-label">{step.label}</span>
            <span className="flow-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FutureAgentCard() {
  return (
    <section className="panel agent" aria-labelledby="agent-title">
      <div className="panel-head">
        <h2 id="agent-title">Future AI Agent</h2>
        <span className="panel-tag chip--soon">Coming soon</span>
      </div>
      <p className="agent-copy">
        Soon: summarize macro pressure, sector rotation, ticker-specific catalysts,
        and whether the setup still deserves attention.
      </p>
      <button type="button" className="btn btn--ghost" disabled>
        Generate briefing
      </button>
    </section>
  );
}

function App() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);
  const [selectedTicker, setSelectedTicker] = useState<string>(
    INITIAL_WATCHLIST[0]?.ticker ?? "",
  );

  const selectedItem = useMemo(
    () => watchlist.find((item) => item.ticker === selectedTicker),
    [watchlist, selectedTicker],
  );

  function handleAdd(ticker: string) {
    setWatchlist((current) => {
      if (current.some((item) => item.ticker === ticker)) {
        setSelectedTicker(ticker);
        return current;
      }
      const newItem: WatchlistItem = {
        ticker,
        name: "New position · Pending research",
        price: 0,
        changePct: 0,
        status: "Watching",
        conviction: 40,
      };
      setSelectedTicker(ticker);
      return [...current, newItem];
    });
  }

  function handleRemove(ticker: string) {
    setWatchlist((current) => {
      const next = current.filter((item) => item.ticker !== ticker);
      if (ticker === selectedTicker) {
        setSelectedTicker(next[0]?.ticker ?? "");
      }
      return next;
    });
  }

  const activeSection: SectionId = "home";

  return (
    <div className="app">
      <Header activeSection={activeSection} />
      <main className="app-main">
        <Hero />

        {selectedItem ? (
          <div className="dashboard-grid">
            <WatchlistPanel
              watchlist={watchlist}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
            <div className="dashboard-center">
              <AnalysisPanel
                item={selectedItem}
                analysis={TICKER_ANALYSIS[selectedItem.ticker]}
              />
              <ChartPlaceholder ticker={selectedItem.ticker} />
            </div>
            <CaptainLog
              ticker={selectedItem.ticker}
              entry={LOG_ENTRIES[selectedItem.ticker]}
            />
          </div>
        ) : (
          <div className="dashboard-grid dashboard-grid--empty">
            <WatchlistPanel
              watchlist={watchlist}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
            <div className="empty-board panel">
              <h2>Your watch is empty</h2>
              <p>Add a ticker to start building conviction and logging your thesis.</p>
            </div>
          </div>
        )}

        <div className="support-grid">
          <FundamentalEducation />
          <IndicatorEducation />
          <StrategyBuilderPreview />
          <MarketFlowPreview />
          <FutureAgentCard />
        </div>
      </main>
      <footer className="site-footer">
        <p>Skulls &amp; Trading · Built for conviction, discipline, and the setup.</p>
      </footer>
    </div>
  );
}

export default App;
