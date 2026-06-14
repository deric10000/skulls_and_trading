import { useAppState } from "../state/AppState";

export function HeroCard({ variant = "full" }: { variant?: "full" | "center" }) {
  const { setActivePage, watchlist } = useAppState();

  return (
    <section
      className={variant === "center" ? "hero hero--center" : "hero"}
      aria-labelledby="hero-title"
    >
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
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setActivePage("dashboard")}
          >
            Open the Dashboard
          </button>
        </div>
        <dl className="hero-stats">
          <div className="hero-stat">
            <dt>Conviction tracked</dt>
            <dd>{watchlist.length} names</dd>
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
