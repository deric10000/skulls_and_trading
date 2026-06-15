import type { ShipMember } from "../../types";

export function MemberCard({ member }: { member: ShipMember }) {
  return (
    <article className="member-card">
      <div className="member-avatar" aria-hidden="true">
        {member.name.slice(0, 1)}
      </div>
      <div className="member-body">
        <div className="member-head">
          <span className="member-name">{member.name}</span>
          <span className="chip status--neutral">{member.role}</span>
        </div>
        <div className="member-meta">
          <span className="member-stat">
            Discipline <strong>{member.disciplineScore}</strong>
          </span>
          <span className="member-stat">
            Streak <strong>{member.streakDays}d</strong>
          </span>
        </div>
      </div>
    </article>
  );
}
