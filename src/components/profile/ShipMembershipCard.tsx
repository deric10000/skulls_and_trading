import { SHIP_MEMBERSHIPS } from "../../data";
import { useAppState } from "../../state/AppState";

export function ShipMembershipCard() {
  const { setActivePage } = useAppState();

  return (
    <section className="panel ship-membership" aria-labelledby="ship-membership-title">
      <div className="panel-head">
        <h2 id="ship-membership-title">Your Ships</h2>
        <span className="panel-tag">{SHIP_MEMBERSHIPS.length} crews</span>
      </div>
      <ul className="ship-membership-list">
        {SHIP_MEMBERSHIPS.map((ship) => (
          <li key={ship.id} className="ship-membership-item">
            <div className="ship-membership-top">
              <span className="ship-membership-name">{ship.name}</span>
              <span className="chip status--neutral">{ship.role}</span>
            </div>
            <p className="ship-membership-blurb">{ship.blurb}</p>
            <span className="ship-membership-meta">{ship.members} crew members</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        onClick={() => setActivePage("ships")}
      >
        View all Ships
      </button>
    </section>
  );
}
