import { useState } from "react";
import { useAppState } from "../../state/AppState";
import { AuthButton } from "./AuthButton";
import { AuthErrorState } from "./AuthErrorState";

export function SignUpForm() {
  const { signUp } = useAppState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    setError("");
    // Mock only: no account is actually created.
    signUp(name);
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
      <AuthButton type="submit">Create account &amp; set sail</AuthButton>
    </form>
  );
}
