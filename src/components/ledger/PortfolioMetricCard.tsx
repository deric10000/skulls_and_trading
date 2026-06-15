import type { PortfolioMetric } from "../../types";

export function PortfolioMetricCard({ metric }: { metric: PortfolioMetric }) {
  return (
    <article
      className={
        metric.emphasis ? "metric-card metric-card--hero" : "metric-card"
      }
    >
      <span className="metric-card-label">{metric.label}</span>
      <span className={`metric-card-value metric-card-value--${metric.tone}`}>
        {metric.value}
      </span>
      <span className="metric-card-tagline">{metric.tagline}</span>
    </article>
  );
}
