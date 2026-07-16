import { useState } from "react";
import brandLogo from "../../assets/st-logo.png";
import brandWordmark from "../../assets/st-wordmark.svg";
import loginBackground from "../../assets/skulls-and-trading-login-background-2.webp";
import loginBackgroundMobile from "../../assets/skulls-and-trading-login-background-mobile.webp";
import { isSupabaseConfigured } from "../../lib/auth/supabaseClient";
import { signInWithPassword } from "../../lib/auth/session";
import { useAppState } from "../../state/AppState";
import { Tabs, type TabItem } from "../Tabs";
import { LockKey, ShieldStar, Strategy } from "../../lib/icons";
import { AuthButton } from "./AuthButton";
import { AuthErrorState } from "./AuthErrorState";
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
  const { completeBetaSignIn } = useAppState();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      setError(
        "Beta sign-in is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
      return;
    }
    // Prefer live input.value over FormData — iOS Keychain sometimes paints
    // dots while FormData still sees an empty password until the field is tapped.
    const form = event.currentTarget;
    const emailInput = form.elements.namedItem("email");
    const passwordInput = form.elements.namedItem("password");
    const emailValue =
      emailInput instanceof HTMLInputElement ? emailInput.value.trim() : "";
    const passwordValue =
      passwordInput instanceof HTMLInputElement ? passwordInput.value : "";
    if (!emailValue.includes("@")) {
      setError("Enter a valid email, Captain.");
      return;
    }
    if (passwordValue.length < 1) {
      setError(
        "Password looks empty. On iPhone, tap the password field after autofill, then sign in again.",
      );
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await signInWithPassword(emailValue, passwordValue);
      await completeBetaSignIn();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Could not sign in. Check your credentials.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div
        className="auth-backdrop"
        style={
          {
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
            <p className="auth-brand-kicker">Invite-only Closed Beta:</p>
            <ul className="auth-brand-points">
              {BRAND_FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="auth-brand-point">
                  <Icon className="auth-brand-point-icon" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            <p className="auth-brand-note">
              Your strategies and portfolios save to your account — not a shared demo.
            </p>
          </aside>

          <section className="auth-panel panel" aria-label="Sign in or create an account">
            <div className="demo-card">
              <div className="demo-card-head">
                <h3>Invite-only Beta</h3>
                <span className="chip status--neutral">Persisted accounts</span>
              </div>
              <p>
                Ask the Admin Captain for a one-time invite code to create an account.
                Demo Captain is retired for saved Beta work.
              </p>
            </div>

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
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    required
                  />
                </label>
                <label className="auth-field">
                  <span>Password</span>
                  <input
                    className="input"
                    name="password"
                    type="password"
                    placeholder="Your password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <AuthErrorState message={error} />
                <AuthButton type="submit" disabled={submitting}>
                  {submitting ? "Signing in\u2026" : "Sign in to the command deck"}
                </AuthButton>
              </form>
            ) : (
              <SignUpForm />
            )}

            <p className="auth-safety">
              Skulls and Trading does not place trades or provide personalized
              financial advice. It helps you track your own strategy and discipline.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
