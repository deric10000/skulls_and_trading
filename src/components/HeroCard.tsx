import bullCompass from "../assets/bull-skull-compass.png";
import bearCompass from "../assets/bear-skull-compass.png";
import { Skull, TrendUp } from "../lib/icons";
import { useAppState } from "../state/AppState";

export function HeroCard({ variant = "full" }: { variant?: "full" | "center" }) {
  const { setActivePage } = useAppState();

  return (
    <section
      className={variant === "center" ? "hero hero--center" : "hero"}
      aria-labelledby="hero-title"
    >
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-body">
        <div className="hero-content">
          <p className="eyebrow">Discipline Command Center</p>
          <h1 id="hero-title">
            Trade your plan. Track your discipline. Level up your strategy.
          </h1>
          <p className="lede">
            Skulls and Trading is an AI-powered investing journal that helps users
            trade their plan instead of chasing the market.
          </p>
          <p className="lede">
            It tracks portfolios, strategies, risk rules, and Captain’s Log entries,
            then uses AI to show where users are aligned, drifting, or breaking their
            own rules.
          </p>
          <p className="lede">
            It’s not a stock-picking app. It’s a discipline engine for serious retail
            investors.
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
        </div>
        <aside className="hero-preview" aria-hidden="true">
          <div className="hero-preview-card">
            <div className="hero-preview-card-head">
              <div className="compass">
                <img className="compass-img" src={bullCompass} alt="" />
              </div>
              <span className="chip status--positive">
                <TrendUp aria-hidden />
                Strategy Check
              </span>
            </div>
            <p>Your rules, your thesis, your invalidation — checked before you act.</p>
          </div>
          <div className="hero-preview-card">
            <div className="hero-preview-card-head">
              <div className="compass compass--risk">
                <img className="compass-img" src={bearCompass} alt="" />
              </div>
              <span className="chip status--negative">
                <Skull aria-hidden />
                Risk Drift
              </span>
            </div>
            <p>
              When the market turns against your plan, see what changed before
              emotion takes the helm — thesis, position size, cash, exposure, or
              invalidation.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
