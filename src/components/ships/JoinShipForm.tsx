import { useState } from "react";

export function JoinShipForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) {
      setMessage("Enter an invite code to request to board.");
      return;
    }
    // Mock only: no real join happens.
    setMessage(`Request to board sent with code "${code.trim()}" (demo).`);
    setCode("");
  }

  return (
    <section className="panel ship-form" aria-labelledby="join-ship-title">
      <div className="panel-head">
        <h2 id="join-ship-title">Join with a code</h2>
        <span className="panel-tag">Invite only</span>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Invite code</span>
          <input
            className="input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. IRON-TIDE-42"
          />
        </label>
        <button type="submit" className="btn btn--ghost btn--block">
          Request to board
        </button>
        {message ? <p className="ship-form-message">{message}</p> : null}
      </form>
    </section>
  );
}
