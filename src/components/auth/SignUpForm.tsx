import { useState } from "react";
import { isSupabaseConfigured } from "../../lib/auth/supabaseClient";
import {
  stashPendingInvite,
  signUpWithInvite,
} from "../../lib/auth/session";
import { useAppState } from "../../state/AppState";
import { AuthButton } from "./AuthButton";
import { AuthErrorState } from "./AuthErrorState";

export function SignUpForm() {
  const { completeBetaSignIn } = useAppState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      setError(
        "Beta sign-up is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
      return;
    }
    if (!name.trim()) {
      setError("Choose a captain name to sail under.");
      return;
    }
    if (!email.includes("@")) {
      setError("Enter a valid email so we can save your charts.");
      return;
    }
    if (password.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    if (!inviteCode.trim()) {
      setError("Enter the one-time invite code from the Admin Captain.");
      return;
    }
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const result = await signUpWithInvite({
        email,
        password,
        captainName: name,
        inviteCode,
      });
      if (result.needsEmailConfirm) {
        stashPendingInvite(inviteCode);
        setInfo(
          "Account created. If login says email not confirmed, ask Admin to confirm you in Supabase (or turn off Confirm email under Authentication → Providers → Email). Then sign in — your invite will redeem on first login.",
        );
        return;
      }
      await completeBetaSignIn();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create your account.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="auth-field">
        <span>Captain name</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Captain Vega"
          autoComplete="nickname"
        />
      </label>
      <label className="auth-field">
        <span>Invite code</span>
        <input
          className="input"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="One-time Beta invite"
          autoComplete="off"
        />
      </label>
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
          placeholder="At least 6 characters"
          autoComplete="new-password"
        />
      </label>
      <AuthErrorState message={error} />
      {info ? <p className="auth-safety">{info}</p> : null}
      <AuthButton type="submit" disabled={submitting}>
        {submitting ? "Creating account\u2026" : "Create account & set sail"}
      </AuthButton>
    </form>
  );
}
