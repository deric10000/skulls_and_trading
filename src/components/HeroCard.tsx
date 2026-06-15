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
        <p className="eyebrow">Discipline Command Center</p>
        <h1 id="hero-title">
          Trade your plan. Track your discipline. Level up your strategy.
        </h1>
        <p className="lede">
          Skulls and Trading is a dark command center that rewards following your own
          rules — not chasing trades. Forge a strategy, check each name against it, and
          log the thesis before you act.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setActivePage("dashboard")}
          >
            Open Dashboard
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setActivePage("strategy-forge")}
          >
            Forge a Strategy
          </button>
        </div>
        <dl className="hero-stats">
          <div className="hero-stat">
            <dt>On watch</dt>
            <dd>{watchlist.length} names</dd>
          </div>
          <div className="hero-stat">
            <dt>Lenses</dt>
            <dd>Investor + Trader</dd>
          </div>
          <div className="hero-stat">
            <dt>Rewards</dt>
            <dd>Discipline, not trades</dd>
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
          <span className="chip status--positive">Strategy Check</span>
          <p>Your rules, your thesis, your invalidation — checked before you act.</p>
        </div>
      </aside>
    </section>
  );
}
