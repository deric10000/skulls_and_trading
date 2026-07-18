import { useState, type CSSProperties } from "react";
import bullCompass from "../assets/bull-skull-compass.webp";
import bearCompass from "../assets/bear-skull-compass.webp";
import loginBackground from "../assets/skulls-and-trading-login-background-2.webp";
import loginBackgroundMobile from "../assets/skulls-and-trading-login-background-mobile.webp";
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
      <div
        className="hero-backdrop"
        style={
          {
            "--auth-bg": `url(${loginBackground})`,
            "--auth-bg-mobile": `url(${loginBackgroundMobile})`,
          } as CSSProperties
        }
        aria-hidden="true"
      />
      <div className="hero-body">
        <div className="hero-content">
          <p className="eyebrow">
            A private club for disciplined investors &amp; traders
          </p>
          <h1 id="hero-title">
            <span className="hero-title-line">Build your strategy.</span>{" "}
            <span className="hero-title-line">Follow your plan.</span>{" "}
            <span className="hero-title-line">Improve with evidence.</span>
          </h1>
          <p className="lede">
            Skulls and Trading is the club&rsquo;s flagship — it turns your
            investing rules into a strategy you can apply across your portfolios
            and watchlists.
          </p>
          <p className="lede">
            Track conviction, identify risk drift, and understand when your
            holdings are aligned with—or breaking—your plan.
          </p>
          <p className="lede">
            It doesn&rsquo;t pick stocks for you. It keeps you accountable to
            your own plan — never the gamble.
          </p>
          <p className="lede">
            It&rsquo;s not a brokerage — you won&rsquo;t buy or sell here. Log
            the trades you make on your own platform, then check them against
            your plan. Connecting your live accounts for deeper analysis is on
            the horizon.
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
          <p className="hero-values">
            <span className="hero-values-label">The crew code</span>
            Discipline over dopamine · Integrity of the deck · Crew before
            crowd · The long voyage · Earn the treasure · Always learning ·
            Craft over content
          </p>
        </div>
        <aside className="hero-preview">
          <div className="hero-preview-card">
            <div className="hero-preview-sections">
              <div className="hero-preview-section">
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
              </div>
              <div className="hero-preview-divider" aria-hidden="true" />
              <div className="hero-preview-section">
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
              </div>
            </div>
            <div className="hero-preview-footer">
              <button
                type="button"
                className="hero-preview-action"
                onClick={() => setComingSoonOpen(true)}
              >
                Review alignment →
              </button>
            </div>
          </div>
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
