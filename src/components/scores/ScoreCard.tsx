import type { ScoreMetric } from "../../types";
import { formatDecimals } from "../../lib/format";

export function ScoreCard({
  metric,
  emphasis = false,
}: {
  metric: ScoreMetric;
  emphasis?: boolean;
}) {
  const pct = Math.round((metric.value / metric.max) * 100);

  return (
    <article
      className={emphasis ? "score-card score-card--hero" : "score-card"}
      data-score={metric.key}
    >
      <div className="score-card-head">
        <span className="score-card-label">{metric.label}</span>
        <span className={`score-card-trend score-card-trend--${metric.trend}`}>
          {metric.trendLabel}
        </span>
      </div>
      <div className="score-card-value">
        <span className="score-card-number">{formatDecimals(metric.value)}</span>
        <span className="score-card-max">/ {formatDecimals(metric.max)}</span>
      </div>
      <div className="score-track" aria-hidden="true">
        <span
          className="score-fill"
          data-score={metric.key}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="score-card-tagline">{metric.tagline}</p>
    </article>
  );
}
