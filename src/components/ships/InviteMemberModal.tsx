import { useState } from "react";

export function InviteMemberModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (!open) return null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.includes("@")) return;
    // Mock only.
    setSent(true);
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      onClick={onClose}
    >
      <div className="modal-card panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head">
          <h2 id="invite-title">Invite a member</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close invite dialog"
          >
            &times;
          </button>
        </div>
        {sent ? (
          <>
            <p>Invite sent to {email} (demo). They'll get a request to board.</p>
            <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="firstmate@example.com"
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block">
              Send invite
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
