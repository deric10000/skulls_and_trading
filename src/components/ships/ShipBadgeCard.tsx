import { SHIP_BADGES } from "../../data";
import { BadgeCard } from "../badges/BadgeCard";

export function ShipBadgeCard() {
  return (
    <section className="panel ship-badges" aria-labelledby="ship-badges-title">
      <div className="panel-head">
        <h2 id="ship-badges-title">Ship Badges</h2>
        <span className="panel-tag">Earned as a crew</span>
      </div>
      <div className="badge-grid">
        {SHIP_BADGES.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} />
        ))}
      </div>
    </section>
  );
}
