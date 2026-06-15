import { formatChange } from "../../lib/format";
import type { Position } from "../../types";
import { StatusBadge } from "../StatusBadge";

export function PositionCard({ position }: { position: Position }) {
  return (
    <article className="position-card">
      <div className="position-card-head">
        <span className="position-ticker">{position.ticker}</span>
        <StatusBadge status={position.planLabel} />
      </div>
      <span className="position-name">{position.name}</span>
      <div className="position-meta">
        <span className="position-weight">{position.weightPct}% of book</span>
        <span
          className={
            position.changePct >= 0
              ? "watch-change watch-change--up"
              : "watch-change watch-change--down"
          }
        >
          {formatChange(position.changePct)}
        </span>
      </div>
      <p className="position-note">{position.note}</p>
    </article>
  );
}
