import { dataSource } from "../../lib/datasource";

export function AllocationCard() {
  const allocations = dataSource.getAllocations();
  return (
    <section className="panel allocation-card" aria-labelledby="allocation-title">
      <div className="panel-head">
        <h2 id="allocation-title">Allocation</h2>
        <span className="panel-tag">By theme</span>
      </div>
      <div className="allocation-bar" aria-hidden="true">
        {allocations.map((slice) => (
          <span
            key={slice.label}
            className={`allocation-seg allocation-seg--${slice.tone}`}
            style={{ width: `${slice.pct}%` }}
          />
        ))}
      </div>
      <ul className="allocation-legend">
        {allocations.map((slice) => (
          <li key={slice.label} className="allocation-legend-item">
            <span className={`allocation-dot allocation-dot--${slice.tone}`} aria-hidden="true" />
            <span className="allocation-legend-label">{slice.label}</span>
            <span className="allocation-legend-pct">{slice.pct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
