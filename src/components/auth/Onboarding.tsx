import { useState } from "react";
import { useAppState } from "../../state/AppState";
import { AuthButton } from "./AuthButton";

const STYLES = ["Long-Term Investor", "Swing Trader", "Day Trader", "Mixed"];
const RISK = ["Conservative", "Balanced", "Aggressive"];
const STRATEGIES = [
  "Trend Rider",
  "Momentum",
  "Pullback Entry",
  "Long-Term Compounder",
  "Breakout Watch",
];
const HOLDINGS = ["Start with demo data", "Add tickers manually", "Skip for now"];

interface Step {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  options?: string[];
}

const STEPS: Step[] = [
  {
    key: "profile",
    eyebrow: "Step 1 of 5",
    title: "Name your captain",
    body: "This is how you'll show up to your crew. You can change it any time in Captain Profile.",
  },
  {
    key: "style",
    eyebrow: "Step 2 of 5",
    title: "What's your trading style?",
    body: "We use this to frame your dashboard. It never changes the data or gives advice.",
    options: STYLES,
  },
  {
    key: "risk",
    eyebrow: "Step 2 of 5",
    title: "How do you size risk?",
    body: "This shapes how loudly the app flags when a position drifts past your own rules.",
    options: RISK,
  },
  {
    key: "strategy",
    eyebrow: "Step 3 of 5",
    title: "Pick a starting strategy",
    body: "You'll forge and refine these later. Start with one you recognize.",
    options: STRATEGIES,
  },
  {
    key: "holdings",
    eyebrow: "Step 4 of 5",
    title: "Load your watch",
    body: "We never connect to a brokerage here. Demo data is the fastest way to look around.",
    options: HOLDINGS,
  },
  {
    key: "log",
    eyebrow: "Step 5 of 5",
    title: "Write your first log",
    body: "Discipline starts with a thesis. Jot why you're here and what you want to improve.",
  },
];

export function Onboarding() {
  const { captainName, completeOnboarding } = useAppState();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState(captainName || "");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [firstLog, setFirstLog] = useState("");

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function next() {
    if (isLast) {
      completeOnboarding();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function back() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  return (
    <div className="auth-screen">
      <div className="auth-aurora" aria-hidden="true" />
      <section className="onboarding panel" aria-labelledby="onboarding-title">
        <div className="onboarding-progress" aria-hidden="true">
          {STEPS.map((s, index) => (
            <span
              key={s.key}
              className={
                index <= stepIndex
                  ? "onboarding-dot onboarding-dot--done"
                  : "onboarding-dot"
              }
            />
          ))}
        </div>

        <p className="eyebrow">{step.eyebrow}</p>
        <h1 id="onboarding-title">{step.title}</h1>
        <p className="onboarding-body">{step.body}</p>

        <div className="onboarding-control">
          {step.key === "profile" ? (
            <label className="auth-field">
              <span>Captain name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Captain Vega"
              />
            </label>
          ) : null}

          {step.options ? (
            <div className="onboarding-options">
              {step.options.map((option) => {
                const selected = choices[step.key] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    className={
                      selected
                        ? "onboarding-option onboarding-option--selected"
                        : "onboarding-option"
                    }
                    aria-pressed={selected}
                    onClick={() =>
                      setChoices((current) => ({ ...current, [step.key]: option }))
                    }
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.key === "log" ? (
            <label className="auth-field">
              <span>First log entry</span>
              <textarea
                className="input log-textarea"
                rows={3}
                value={firstLog}
                onChange={(event) => setFirstLog(event.target.value)}
                placeholder="Why I'm here and the habit I want to build..."
              />
            </label>
          ) : null}
        </div>

        <div className="onboarding-actions">
          {stepIndex > 0 ? (
            <AuthButton variant="ghost" fullWidth={false} onClick={back}>
              Back
            </AuthButton>
          ) : (
            <span />
          )}
          <AuthButton fullWidth={false} onClick={next}>
            {isLast ? "Enter the command deck" : "Continue"}
          </AuthButton>
        </div>

        <button type="button" className="onboarding-skip" onClick={completeOnboarding}>
          Skip setup for now
        </button>
      </section>
    </div>
  );
}
