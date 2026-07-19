import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import bullCompass from "../assets/bull-skull-compass.webp";
import bearCompass from "../assets/bear-skull-compass.webp";
import loginBackground from "../assets/skulls-and-trading-login-background-2.webp";
import loginBackgroundMobile from "../assets/skulls-and-trading-login-background-mobile.webp";
import {
  CaretLeft,
  CaretRight,
  MapTrifold,
  Skull,
  TrendUp,
  Warning,
  X,
} from "../lib/icons";
import {
  LEGAL_DISCLAIMER_BODY,
  LEGAL_DISCLAIMER_TITLE,
} from "../lib/legal/disclaimer";
import { useAppState } from "../state/AppState";
import { Stepper } from "./Stepper";

/**
 * Onboarding — the first-login walkthrough modal (this is the app's
 * onboarding, not the Helm itself; the future Helm surface will host a
 * trigger that reopens it any time).
 *
 * Forge-modal chrome + the shared Stepper under the header. Steps live in
 * ONBOARDING_STEPS below — a registry so future steps ship dark: entries
 * flagged `underConstruction` (Dashboard, Captain Profile) stay hidden until
 * their surfaces are ready. Every visible step follows the Welcome step's
 * blueprint (gold eyebrow, bold white H1, lede paragraphs over the hero
 * backdrop art); the final Disclaimer step reuses the legal panel's exact
 * look and swaps the footer's Previous/Next toggle for the Acknowledge
 * button.
 *
 * Legal acknowledgment rides the last step: Acknowledge = acknowledgeLegal()
 * + dismiss. Closing early (X / backdrop) dismisses onboarding only —
 * AuthedApp then pops the standalone legal modal, so the disclaimer is never
 * skippable.
 */

export interface OnboardingStep {
  id: string;
  label: string;
  /** Hidden from the stepper until the surface it teaches is ready. */
  underConstruction?: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "welcome", label: "Welcome" },
  { id: "strategies", label: "Strategies" },
  { id: "current-watch", label: "Current Watch" },
  { id: "market-weather", label: "Market Weather" },
  { id: "dashboard", label: "Dashboard", underConstruction: true },
  { id: "captain-profile", label: "Captain Profile", underConstruction: true },
  { id: "disclaimer", label: "Disclaimer" },
];

const BACKDROP_VARS = {
  "--auth-bg": `url(${loginBackground})`,
  "--auth-bg-mobile": `url(${loginBackgroundMobile})`,
} as CSSProperties;

/** Steps 2–4 follow the Welcome blueprint: eyebrow, H1, ledes on the art. */
function GuideStep({
  eyebrow,
  title,
  ledes,
}: {
  eyebrow: string;
  title: string;
  ledes: string[];
}) {
  return (
    <div className="onboarding-canvas">
      <div className="hero-backdrop" style={BACKDROP_VARS} aria-hidden="true" />
      <div className="hero-content">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {ledes.map((lede) => (
          <p key={lede.slice(0, 24)} className="lede">
            {lede}
          </p>
        ))}
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="onboarding-canvas">
      <div className="hero-backdrop" style={BACKDROP_VARS} aria-hidden="true" />
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
  );
}

function DisclaimerStep({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <div className="onboarding-disclaimer">
      <div className="coming-soon-head">
        <Warning className="coming-soon-icon" aria-hidden weight="fill" />
        <h2 className="coming-soon-title">{LEGAL_DISCLAIMER_TITLE}</h2>
      </div>
      <p className="coming-soon-trust">{LEGAL_DISCLAIMER_BODY}</p>
      {/* In the body, away from the footer toggle, so nobody can fly past it
          stepping Next and exit unintentionally. */}
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={onAcknowledge}
      >
        Acknowledge
      </button>
    </div>
  );
}

function StepBody({
  stepId,
  onAcknowledge,
}: {
  stepId: string;
  onAcknowledge: () => void;
}) {
  if (stepId === "welcome") return <WelcomeStep />;
  if (stepId === "strategies") {
    return (
      <GuideStep
        eyebrow="Strategy Forge"
        title="Forge your strategy."
        ledes={[
          "Head to the Strategy Forge and start with a default strategy, or build your own. Set your thesis, choose the rule chips that define your plan, and weight what matters most.",
          "Then apply the strategy to a portfolio or watchlist. Your rules become the standard every name gets checked against — refine them any time.",
        ]}
      />
    );
  }
  if (stepId === "current-watch") {
    return (
      <GuideStep
        eyebrow="Current Watch"
        title="Set up your watch."
        ledes={[
          "On Home, create a paper portfolio or a watchlist and add your names. A paper book uses practice cash and size — no live brokerage link, no real orders.",
          "With a strategy applied, every name shows its conviction — how well it lines up with your rules. It's a check against your plan, never a call to buy or sell.",
        ]}
      />
    );
  }
  if (stepId === "market-weather") {
    return (
      <GuideStep
        eyebrow="Market Weather"
        title="Read the weather."
        ledes={[
          "The Market Weather card reads conditions layer by layer — Market, Sector, Industry, down to a single Stock.",
          "Check it before you act to see whether your names are sailing with the weather or fighting the wind.",
        ]}
      />
    );
  }
  return <DisclaimerStep onAcknowledge={onAcknowledge} />;
}

export function OnboardingModal() {
  const { dismissOnboardingModal, acknowledgeLegal } = useAppState();
  const steps = ONBOARDING_STEPS.filter((step) => !step.underConstruction);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  if (typeof document === "undefined") return null;

  // X / backdrop: dismiss without acknowledgment — AuthedApp pops the
  // standalone legal modal next, so the disclaimer still gates the app.
  function close() {
    dismissOnboardingModal();
  }

  function acknowledge() {
    acknowledgeLegal();
    dismissOnboardingModal();
  }

  function stepBy(delta: number) {
    setStepIndex((current) =>
      Math.min(steps.length - 1, Math.max(0, current + delta)),
    );
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={close}>
      <div
        className="modal-card panel forge-table-modal onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forge-table-head">
          <h2 id="onboarding-title">
            {/* Explicit size: no IconContext size is set app-wide, and a
                Phosphor icon without one renders no width/height attributes —
                it collapses to 0×0 in this flex row (same trap as the
                `.btn svg` standard in components.mdc). */}
            <MapTrifold size={20} aria-hidden weight="fill" />
            Onboarding
          </h2>
          <button
            type="button"
            className="forge-table-close"
            onClick={close}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>

        <div className="onboarding-stepper-row">
          <Stepper
            tone="accent"
            steps={steps.map((item, index) => ({
              label: item.label,
              complete: index < stepIndex,
              active: index === stepIndex,
            }))}
            onSelectStep={setStepIndex}
          />
        </div>

        <div className="onboarding-body">
          <StepBody stepId={step.id} onAcknowledge={acknowledge} />
        </div>

        <div className="strategy-footer onboarding-actions">
          <div
            className="weather-prevnext"
            role="group"
            aria-label="Step through onboarding"
          >
            <button
              type="button"
              className="weather-prevnext-btn"
              aria-label="Previous step"
              disabled={stepIndex === 0}
              onClick={() => stepBy(-1)}
            >
              <CaretLeft weight="bold" aria-hidden />
              Previous
            </button>
            <button
              type="button"
              className="weather-prevnext-btn"
              aria-label="Next step"
              disabled={isLastStep}
              onClick={() => stepBy(1)}
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
