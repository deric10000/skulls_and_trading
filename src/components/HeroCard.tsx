import { useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import bullCompass from "../assets/bull-skull-compass.webp";
import bearCompass from "../assets/bear-skull-compass.webp";
import loginBackground from "../assets/skulls-and-trading-login-background-2.webp";
import loginBackgroundMobile from "../assets/skulls-and-trading-login-background-mobile.webp";
import {
  CaretLeft,
  CaretRight,
  ChartBar,
  Hammer,
  MapTrifold,
  Skull,
  TrendUp,
} from "../lib/icons";
import { useIsMobile } from "../lib/useIsMobile";
import { useAppState } from "../state/AppState";
import { ActionFooter } from "./ActionFooter";

type HeroCardProps = {
  variant?: "full" | "center";
  /** Jump to Home Current Watch (Helm primary/secondary CTAs). */
  onReviewWatch?: () => void;
  /**
   * Mobile (≤767px): when true, lift the Helm Previous/Next bar into the
   * shared `.strategy-dock` sticky dock (same as Current Watch totals). Home
   * passes this while the Helm tab is active.
   */
  mobileNavDock?: boolean;
};

/** Helm pages — club manifesto is page 1; more pages land as The Helm expands. */
const HELM_PAGE_IDS = ["club"] as const;
type HelmPageId = (typeof HELM_PAGE_IDS)[number];

function HelmPrevNext({ onStep }: { onStep: (delta: -1 | 1) => void }) {
  return (
    <div
      className="weather-prevnext"
      role="group"
      aria-label="Helm pages"
    >
      <button
        type="button"
        className="weather-prevnext-btn"
        aria-label="Previous page"
        onClick={() => onStep(-1)}
      >
        <CaretLeft weight="bold" aria-hidden />
        Previous
      </button>
      <button
        type="button"
        className="weather-prevnext-btn"
        aria-label="Next page"
        onClick={() => onStep(1)}
      >
        Next
        <CaretRight weight="bold" aria-hidden />
      </button>
    </div>
  );
}

export function HeroCard({
  variant = "full",
  onReviewWatch,
  mobileNavDock = false,
}: HeroCardProps) {
  const { setActivePage, portfolios, openOnboardingModal } = useAppState();
  const isMobile = useIsMobile();
  const [pageIndex, setPageIndex] = useState(0);
  const hasHoldings = portfolios.some(
    (portfolio) => portfolio.holdings.length > 0,
  );
  const pageCount = HELM_PAGE_IDS.length;
  const pageId: HelmPageId = HELM_PAGE_IDS[pageIndex] ?? "club";

  function goToWatch() {
    if (onReviewWatch) {
      onReviewWatch();
      return;
    }
    setActivePage("home");
  }

  // Wrap both ways (Market Weather stock toggle) — never disable.
  function stepPage(delta: -1 | 1) {
    setPageIndex((current) => (current + delta + pageCount) % pageCount);
  }

  const pageBody: ReactNode =
    pageId === "club" ? (
      <>
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
                onClick={() => setActivePage("dashboard")}
              >
                <ChartBar aria-hidden />
                Launch Dashboard
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setActivePage("strategy-forge")}
              >
                <Hammer aria-hidden />
                Forge a Strategy
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={openOnboardingModal}
              >
                <MapTrifold aria-hidden />
                Onboarding
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
      </>
    ) : null;

  const navToggle = <HelmPrevNext onStep={stepPage} />;

  const mobileDock =
    isMobile && mobileNavDock
      ? (() => {
          const footer = (
            <ActionFooter className="helm-nav-footer strategy-dock">
              {navToggle}
            </ActionFooter>
          );
          if (typeof document === "undefined") return footer;
          const dockHost =
            document.querySelector("main.app-main") ?? document.body;
          return createPortal(footer, dockHost);
        })()
      : null;

  return (
    <section
      className={variant === "center" ? "hero hero--center" : "hero"}
      aria-labelledby="helm-title"
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
      <div className="panel-head">
        <h2 id="helm-title">The Helm</h2>
      </div>
      <div className="hero-body">
        <div className="hero-content">
          <div className="hero-eyebrow-row">
            <p className="eyebrow">
              A private club for disciplined investors &amp; traders
            </p>
            <div className="hero-eyebrow-nav">{navToggle}</div>
          </div>
          {pageBody}
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
          </div>
        </aside>
      </div>
      {mobileDock}
    </section>
  );
}
