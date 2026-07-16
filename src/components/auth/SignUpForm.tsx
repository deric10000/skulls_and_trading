import { useState } from "react";
import { ensureSupabaseReady } from "../../lib/auth/supabaseClient";
import {
  stashPendingInvite,
  signUpWithInvite,
} from "../../lib/auth/session";
import { useAppState } from "../../state/AppState";
import { AuthButton } from "./AuthButton";
import { AuthErrorState } from "./AuthErrorState";

export function SignUpForm() {
  const { completeBetaSignIn } = useAppState();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const configured = await ensureSupabaseReady();
    if (!configured) {
      setError(
        "Beta sign-up is not available yet. Ask the Admin Captain — Worker auth config is missing.",
      );
      return;
    }
    // Uncontrolled fields + FormData: iOS Keychain can fill the DOM without
    // React onChange, and controlled value="" would fight autofill.
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nameValue = String(formData.get("captainName") ?? "").trim();
    const inviteValue = String(formData.get("inviteCode") ?? "").trim();
    let emailValue = String(formData.get("email") ?? "").trim();
    let passwordValue = String(formData.get("password") ?? "");
    if (!emailValue.includes("@") || passwordValue.length < 6) {
      await new Promise((r) => window.setTimeout(r, 100));
      const again = new FormData(form);
      emailValue = String(again.get("email") ?? "").trim();
      passwordValue = String(again.get("password") ?? "");
    }
    if (!nameValue) {
      setError("Choose a captain name to sail under.");
      return;
    }
    if (!emailValue.includes("@")) {
      setError("Enter a valid email so we can save your charts.");
      return;
    }
    if (passwordValue.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    if (!inviteValue) {
      setError("Enter the one-time invite code from the Admin Captain.");
      return;
    }
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const result = await signUpWithInvite({
        email: emailValue,
        password: passwordValue,
        captainName: nameValue,
        inviteCode: inviteValue,
      });
      if (result.needsEmailConfirm) {
        stashPendingInvite(inviteValue);
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
          name="captainName"
          placeholder="e.g. Captain Vega"
          autoComplete="nickname"
          required
        />
      </label>
      <label className="auth-field">
        <span>Invite code</span>
        <input
          className="input"
          name="inviteCode"
          placeholder="One-time Beta invite"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
      </label>
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
          placeholder="At least 6 characters"
          autoComplete="new-password"
          required
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
