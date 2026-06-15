import type { Badge } from "../../types";

const RARITY_LABEL: Record<Badge["rarity"], string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const STATE_LABEL: Record<Badge["state"], string> = {
  locked: "Locked",
  "in-progress": "In progress",
  earned: "Earned",
};

export function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <article
      className={`badge-card badge-card--${badge.state}`}
      data-rarity={badge.rarity}
    >
      <div className="badge-medallion" data-rarity={badge.rarity} aria-hidden="true">
        <span className="badge-medallion-mark">
          {badge.state === "locked" ? "?" : "★"}
        </span>
      </div>
      <div className="badge-card-body">
        <div className="badge-card-head">
          <span className="badge-card-name">{badge.name}</span>
          <span className="badge-rarity" data-rarity={badge.rarity}>
            {RARITY_LABEL[badge.rarity]}
          </span>
        </div>
        <p className="badge-card-desc">{badge.description}</p>
        {badge.state === "in-progress" && typeof badge.progress === "number" ? (
          <div className="badge-progress" aria-hidden="true">
            <span
              className="badge-progress-fill"
              style={{ width: `${badge.progress}%` }}
            />
          </div>
        ) : null}
        <span className={`badge-state badge-state--${badge.state}`}>
          {STATE_LABEL[badge.state]}
          {badge.state === "in-progress" && typeof badge.progress === "number"
            ? ` · ${badge.progress}%`
            : ""}
        </span>
      </div>
    </article>
  );
}
