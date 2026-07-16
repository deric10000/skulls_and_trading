import { useState } from "react";
import bullCompass from "../assets/bull-skull-compass.png";
import bearCompass from "../assets/bear-skull-compass.png";
import { Skull, TrendUp } from "../lib/icons";
import { useAppState } from "../state/AppState";
import { ComingSoonOverlay } from "./ComingSoonOverlay";

type HeroCardProps = {
  variant?: "full" | "center";
  /** Jump to Home Current Watch (About tab primary/secondary CTAs). */
  onReviewWatch?: () => void;
};

export function HeroCard({
  variant = "full",
  onReviewWatch,
}: HeroCardProps) {
  const { setActivePage, portfolios } = useAppState();
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const hasHoldings = portfolios.some(
    (portfolio) => portfolio.holdings.length > 0,
  );

  function goToWatch() {
    if (onReviewWatch) {
      onReviewWatch();
      return;
    }
    setActivePage("home");
  }

  return (
    <section
      className={variant === "center" ? "hero hero--center" : "hero"}
      aria-labelledby="hero-title"
    >
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-body">
        <div className="hero-content">
          <p className="eyebrow">Your Investing Discipline Engine</p>
          <h1 id="hero-title">
            Build your strategy.
            <br />
            Follow your plan.
            <br />
            Improve with evidence.
          </h1>
          <p className="lede">
            Skulls and Trading turns your investing rules into a strategy you can
            apply across your portfolios and watchlists.
          </p>
          <p className="lede">
            Track conviction, identify risk drift, and understand when your
            holdings are aligned with—or breaking—your plan.
          </p>
          <p className="lede">
            It doesn&rsquo;t pick stocks for you. It helps you make more
            disciplined decisions using your own strategy.
          </p>
          <div className="hero-actions">
            {hasHoldings ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setComingSoonOpen(true)}
                >
                  Review Watch in Dashboard
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setActivePage("strategy-forge")}
                >
                  Forge a Strategy
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setActivePage("strategy-forge")}
                >
                  Create Your First Strategy
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={goToWatch}
                >
                  Set Up Current Watch
                </button>
              </>
            )}
          </div>
        </div>
        <aside className="hero-preview">
          <button
            type="button"
            className="hero-preview-card"
            onClick={() => setComingSoonOpen(true)}
          >
            <div className="hero-preview-card-head">
              <div className="compass">
                <img className="compass-img" src={bullCompass} alt="" />
              </div>
              <span className="chip status--positive">
                <TrendUp aria-hidden />
                Strategy Check
              </span>
            </div>
            <p>
              See which holdings align with your thesis, rules, and
              strategy—and which need attention.
            </p>
            <span className="hero-preview-action">Review alignment →</span>
          </button>
          <button
            type="button"
            className="hero-preview-card"
            onClick={() => setComingSoonOpen(true)}
          >
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
              Catch changes in position size, exposure, cash, thesis, or
              invalidation before emotion takes over.
            </p>
            <span className="hero-preview-action">Review risk →</span>
          </button>
        </aside>
      </div>
      {comingSoonOpen ? (
        <ComingSoonOverlay
          variant="dismissible"
          onDismiss={() => setComingSoonOpen(false)}
        />
      ) : null}
    </section>
  );
}
