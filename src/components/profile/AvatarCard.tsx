import { useAppState } from "../../state/AppState";

function initials(handle: string): string {
  const parts = handle.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ST";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AvatarCard() {
  const { captain, updateCaptain } = useAppState();

  return (
    <section className="panel avatar-card" aria-labelledby="identity-title">
      <div className="panel-head">
        <h2 id="identity-title">Identity</h2>
        <span className="panel-tag">{captain.privacy}</span>
      </div>
      <div className="avatar-row">
        <div className="avatar-mark" aria-hidden="true">
          {initials(captain.handle)}
        </div>
        <div className="avatar-fields">
          <label className="auth-field">
            <span>Captain handle</span>
            <input
              className="input"
              value={captain.handle}
              onChange={(event) => updateCaptain({ handle: event.target.value })}
              placeholder="Captain name"
            />
          </label>
          <label className="auth-field">
            <span>Tagline</span>
            <input
              className="input"
              value={captain.tagline}
              onChange={(event) => updateCaptain({ tagline: event.target.value })}
              placeholder="How you trade, in one line"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
