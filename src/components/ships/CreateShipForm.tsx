import { useState } from "react";
import type { Ship } from "../../types";

const PRIVACY: Ship["privacy"][] = ["Open", "Invite Only", "Private"];

export function CreateShipForm() {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [privacy, setPrivacy] = useState<Ship["privacy"]>("Invite Only");
  const [created, setCreated] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    // Mock only: no ship is actually created.
    setCreated(true);
  }

  if (created) {
    return (
      <section className="panel ship-form" aria-label="Ship created">
        <div className="panel-head">
          <h2>Create a Ship</h2>
          <span className="chip status--positive">Drafted</span>
        </div>
        <p>
          <strong>{name || "Your ship"}</strong> is ready to launch (demo). Invite your
          first mates when you're set.
        </p>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          onClick={() => {
            setCreated(false);
            setName("");
            setFocus("");
          }}
        >
          Draft another
        </button>
      </section>
    );
  }

  return (
    <section className="panel ship-form" aria-labelledby="create-ship-title">
      <div className="panel-head">
        <h2 id="create-ship-title">Create a Ship</h2>
        <span className="panel-tag">Start a crew</span>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Ship name</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Iron Tide"
          />
        </label>
        <label className="auth-field">
          <span>Focus</span>
          <input
            className="input"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            placeholder="e.g. Swing trading discipline"
          />
        </label>
        <label className="auth-field">
          <span>Privacy</span>
          <select
            className="input"
            value={privacy}
            onChange={(event) => setPrivacy(event.target.value as Ship["privacy"])}
          >
            {PRIVACY.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--primary btn--block">
          Create Ship
        </button>
      </form>
    </section>
  );
}
