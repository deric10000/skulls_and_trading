import { useState } from "react";
import brandLogo from "../../assets/st-logo.png";
import brandWordmark from "../../assets/st-wordmark.svg";
import loginBackground from "../../assets/skulls-and-trading-login-background-2.webp";
import loginBackgroundMobile from "../../assets/skulls-and-trading-login-background-mobile.webp";
import { useAppState } from "../../state/AppState";
import { Tabs, type TabItem } from "../Tabs";
import { CaretLeft, LockKey, ShieldStar, Strategy } from "../../lib/icons";
import { AuthButton } from "./AuthButton";
import { AuthErrorState } from "./AuthErrorState";
import { DemoModeCard } from "./DemoModeCard";
import { SignUpForm } from "./SignUpForm";

type Mode = "sign-in" | "sign-up";

const AUTH_TABS: TabItem[] = [
  { id: "sign-in", label: "Sign in" },
  { id: "sign-up", label: "Create account" },
];

const BRAND_FEATURES = [
  {
    icon: Strategy,
    label: "Strategy-driven checks",
  },
  {
    icon: ShieldStar,
    label: "Discipline scores and badges",
  },
  {
    icon: LockKey,
    label: "Private progress tracking",
  },
];

export function LoginScreen() {
  const { signIn, continueAsDemo } = useAppState();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Demo Captain gate (B1) — see .cursor/rules/security-hardening.mdc.
  const [showDemoGate, setShowDemoGate] = useState(false);
  const [demoPassword, setDemoPassword] = useState("");
  const [demoError, setDemoError] = useState("");
  const [demoSubmitting, setDemoSubmitting] = useState(false);

  function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.includes("@") || password.length < 1) {
      setError("Check your email and password, Captain.");
      return;
    }
    setError("");
    // Mock only: any well-formed credentials sign in.
    signIn(email.split("@")[0]);
  }

  function closeDemoGate() {
    setShowDemoGate(false);
    setDemoPassword("");
    setDemoError("");
  }

  async function handleDemoLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demoPassword) {
      setDemoError("Enter the demo password, Captain.");
      return;
    }
    setDemoError("");

    // Local `npm run dev` (Vite) has no Worker, so /api/demo-login doesn't
    // exist there. Skip the network check in dev; the real gate runs under
    // `wrangler dev` and in production (where import.meta.env.DEV is false).
    if (import.meta.env.DEV) {
      continueAsDemo();
      return;
    }

    setDemoSubmitting(true);
    try {
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: demoPassword }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !data?.ok) {
        setDemoError("That password didn't match. Try again.");
        return;
      }
      continueAsDemo();
    } catch {
      setDemoError("Couldn't reach the harbor. Check your connection and try again.");
    } finally {
      setDemoSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div
        className="auth-backdrop"
        style={
          {
            // Desktop/tablet art vs. the portrait phone crop. The CSS picks which
            // one to paint by viewport (see `.auth-backdrop` + its mobile override),
            // so the swap is purely responsive — both are passed in as vars.
            "--auth-bg": `url(${loginBackground})`,
            "--auth-bg-mobile": `url(${loginBackgroundMobile})`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
      <div className="auth-aurora" aria-hidden="true" />
      <div className="auth-shell">
        <header className="auth-brand-mark auth-brand-mark--masthead">
          <img src={brandLogo} alt="" className="auth-brand-logo" aria-hidden="true" />
          <img src={brandWordmark} alt="Skulls and Trading" className="auth-brand-wordmark" />
        </header>

        <div className="auth-login-grid">
          <aside className="auth-brand">
          <h1>Trade your plan. Track your discipline.</h1>
          <p>
            Skulls and Trading is a gamified command center for investors and traders
            who want to follow their rules — not chase the market.
          </p>
          <p>
            Forge your strategy, check each position against your plan, and log the
            thesis before you act.
          </p>
          <p className="auth-brand-kicker">
            Link your accounts to unlock (or track manually):
          </p>
          <ul className="auth-brand-points">
            {BRAND_FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="auth-brand-point">
                <Icon className="auth-brand-point-icon" aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="auth-brand-note">
            Your treasure stays private unless you choose to share it.
          </p>
        </aside>

          {showDemoGate ? (
            <section className="auth-panel panel" aria-label="Demo Captain sign in">
              <button
                type="button"
                className="breadcrumb"
                onClick={closeDemoGate}
              >
                <CaretLeft aria-hidden />
                Back
              </button>

              <div className="demo-card">
                <div className="demo-card-head">
                  <h3>Demo Captain</h3>
                  <span className="chip status--neutral">Crew access</span>
                </div>
                <p>
                  Enter the demo password to board with sample data. Nothing is saved
                  and no trades are ever placed.
                </p>
              </div>

              <form className="auth-form" onSubmit={handleDemoLogin} noValidate>
                <label className="auth-field">
                  <span>Demo password</span>
                  <input
                    className="input"
                    type="password"
                    value={demoPassword}
                    onChange={(event) => setDemoPassword(event.target.value)}
                    placeholder="Demo Captain password"
                    autoComplete="off"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                </label>
                <AuthErrorState message={demoError} />
                <AuthButton type="submit" disabled={demoSubmitting}>
                  {demoSubmitting ? "Boarding\u2026" : "Board as Demo Captain"}
                </AuthButton>
              </form>

              <p className="auth-safety">
                Skulls and Trading does not place trades or provide personalized
                financial advice. It helps you track your own strategy and discipline.
              </p>
            </section>
          ) : (
            <section className="auth-panel panel" aria-label="Sign in or create an account">
              <DemoModeCard onContinue={() => setShowDemoGate(true)} />

              <Tabs
                items={AUTH_TABS}
                value={mode}
                onChange={(id) => setMode(id as Mode)}
                ariaLabel="Authentication mode"
                fill
                className="auth-mode-tabs"
              />

              {mode === "sign-in" ? (
                <form className="auth-form" onSubmit={handleSignIn} noValidate>
                  <label className="auth-field">
                    <span>Email</span>
                    <input
                      className="input"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>
                  <label className="auth-field">
                    <span>Password</span>
                    <input
                      className="input"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
                      autoComplete="current-password"
                    />
                  </label>
                  <AuthErrorState message={error} />
                  <AuthButton type="submit">Sign in to the command deck</AuthButton>
                </form>
              ) : (
                <SignUpForm />
              )}

              <p className="auth-safety">
                Skulls and Trading does not place trades or provide personalized
                financial advice. It helps you track your own strategy and discipline.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
