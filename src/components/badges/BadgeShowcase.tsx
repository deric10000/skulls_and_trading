import { BADGES } from "../../data";
import { BadgeCard } from "./BadgeCard";

export function BadgeShowcase({ limit }: { limit?: number }) {
  const earned = BADGES.filter((badge) => badge.state === "earned").length;
  const badges = typeof limit === "number" ? BADGES.slice(0, limit) : BADGES;

  return (
    <section className="panel badge-showcase" aria-labelledby="badge-title">
      <div className="panel-head">
        <h2 id="badge-title">Badge Shelf</h2>
        <span className="panel-tag">
          {earned} of {BADGES.length} earned
        </span>
      </div>
      <p className="panel-intro">
        Badges reward good habits — discipline, research, and review. None reward
        trading more or taking bigger risk.
      </p>
      <div className="badge-grid">
        {badges.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} />
        ))}
      </div>
    </section>
  );
}
