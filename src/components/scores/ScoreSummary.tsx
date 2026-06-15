import { SCORES } from "../../data";
import { ScoreCard } from "./ScoreCard";

export function ScoreSummary({ compact = false }: { compact?: boolean }) {
  const discipline = SCORES.find((score) => score.key === "discipline");
  const rest = SCORES.filter((score) => score.key !== "discipline");

  return (
    <section className="panel score-summary" aria-labelledby="score-title">
      <div className="panel-head">
        <h2 id="score-title">Discipline Scores</h2>
        <span className="panel-tag">Behavior, not profit</span>
      </div>
      <p className="panel-intro">
        These track how well you follow your own rules. Discipline leads — profit is a
        by-product of good habits.
      </p>
      <div className={compact ? "score-grid score-grid--compact" : "score-grid"}>
        {discipline ? <ScoreCard metric={discipline} emphasis /> : null}
        {rest.map((metric) => (
          <ScoreCard key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}
