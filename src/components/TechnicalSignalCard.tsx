import type { EducationCard } from "../types";

export function TechnicalSignalCard({ card }: { card: EducationCard }) {
  return (
    <article className="edu-card">
      <h3>{card.title}</h3>
      <p>{card.body}</p>
    </article>
  );
}
