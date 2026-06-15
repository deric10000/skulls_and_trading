import type { Ship } from "../../types";

export function ShipCard({
  ship,
  actionLabel,
  onAction,
}: {
  ship: Ship;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <article className="ship-card">
      <div className="ship-card-head">
        <span className="ship-card-name">{ship.name}</span>
        <span className="chip status--neutral">{ship.privacy}</span>
      </div>
      <p className="ship-card-blurb">{ship.blurb}</p>
      <div className="ship-card-meta">
        <span>{ship.focus}</span>
        <span>{ship.members} crew</span>
      </div>
      <button type="button" className="btn btn--small btn--ghost" onClick={onAction}>
        {actionLabel}
      </button>
    </article>
  );
}
