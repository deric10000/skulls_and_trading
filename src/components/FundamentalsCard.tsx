import type { EducationCard } from "../types";

export function FundamentalsCard({ card }: { card: EducationCard }) {
  return (
    <article className="edu-card">
      <h3>{card.title}</h3>
      <p>{card.body}</p>
    </article>
  );
}
