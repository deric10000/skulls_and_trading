import { useState } from "react";
import brandLogo from "../../assets/st-logo.png";
import brandWordmark from "../../assets/st-wordmark.svg";
import { useAppState } from "../../state/AppState";
import { Tabs, type TabItem } from "../Tabs";
import { LockKey, ShieldStar, Strategy } from "../../lib/icons";
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
  const { signIn } = useAppState();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div className="auth-screen">
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

          <section className="auth-panel panel" aria-label="Sign in or create an account">
            <DemoModeCard />

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
              Skulls and Trading does not place trades or provide personalized financial
              advice. It helps you track your own strategy and discipline.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
