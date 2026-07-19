import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import bullCompass from "../assets/bull-skull-compass.webp";
import bearCompass from "../assets/bear-skull-compass.webp";
import loginBackground from "../assets/skulls-and-trading-login-background-2.webp";
import loginBackgroundMobile from "../assets/skulls-and-trading-login-background-mobile.webp";
import { CaretLeft, CaretRight, Skull, TrendUp, X } from "../lib/icons";
import { useAppState } from "../state/AppState";

/**
 * The Helm — first-login welcome modal (feature/helm scaffolding).
 *
 * Forge-modal chrome (`.modal-backdrop` + `.modal-card.forge-table-modal` +
 * `.forge-table-head`) around the Home hero's content, duplicated as it reads
 * today — minus the hero CTAs and preview "Review alignment" link: new users
 * should absorb what the app is before being routed into the Dashboard or
 * Forge. Surfaces once per account: AuthedApp mounts it while `needsHelm`
 * (user_state.flags.helmSeen unset) and any dismissal — X or backdrop — marks
 * the flag via `dismissHelm`, which persists through the normal workspace
 * save path.
 *
 * Onboarding will grow out of this shell: the footer's Previous / Next toggle
 * (stock `.weather-prevnext` control inside a `.strategy-footer` action bar)
 * is the affordance for stepping through Helm states. It is intentionally
 * stateless for now — steps come next.
 */
export function HelmModal() {
  const { dismissHelm } = useAppState();

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={dismissHelm}
    >
      <div
        className="modal-card panel forge-table-modal helm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="helm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forge-table-head">
          <h2 id="helm-title">The Helm</h2>
          <button
            type="button"
            className="forge-table-close"
            onClick={dismissHelm}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>

        <div className="helm-body">
          <div className="helm-canvas">
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
            <div className="hero-content">
              <p className="eyebrow">
                A private club for disciplined investors &amp; traders
              </p>
              <h1>
                <span className="hero-title-line">Build your strategy.</span>{" "}
                <span className="hero-title-line">Follow your plan.</span>{" "}
                <span className="hero-title-line">Improve with evidence.</span>
              </h1>
              <p className="lede">
                Skulls and Trading is the club&rsquo;s flagship — it turns your
                investing rules into a strategy you can apply across your
                portfolios and watchlists.
              </p>
              <p className="lede">
                Track conviction, identify risk drift, and understand when your
                holdings are aligned with—or breaking—your plan.
              </p>
              <p className="lede">
                It doesn&rsquo;t pick stocks for you. It keeps you accountable
                to your own plan — never the gamble.
              </p>
              <p className="lede">
                It&rsquo;s not a brokerage — you won&rsquo;t buy or sell here.
                Log the trades you make on your own platform, then check them
                against your plan. Connecting your live accounts for deeper
                analysis is on the horizon.
              </p>
              <p className="hero-values">
                <span className="hero-values-label">The crew code</span>
                Discipline over dopamine · Integrity of the deck · Crew before
                crowd · The long voyage · Earn the treasure · Always learning ·
                Craft over content
              </p>
            </div>
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
          </div>
        </div>

        <div className="strategy-footer helm-actions">
          <div
            className="weather-prevnext"
            role="group"
            aria-label="Step through the Helm"
          >
            <button
              type="button"
              className="weather-prevnext-btn"
              aria-label="Previous"
            >
              <CaretLeft weight="bold" aria-hidden />
              Previous
            </button>
            <button
              type="button"
              className="weather-prevnext-btn"
              aria-label="Next"
            >
              Next
              <CaretRight weight="bold" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
