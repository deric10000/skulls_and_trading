import { useAppState } from "../state/AppState";
import { IndicatorChips } from "./IndicatorChips";

export function ChartCard() {
  const { selectedItem } = useAppState();
  const ticker = selectedItem?.ticker ?? "—";
  const name = selectedItem?.name ?? "No ticker selected";

  return (
    <section className="panel chart" aria-labelledby="chart-title">
      <div className="panel-head">
        <div>
          <h2 id="chart-title">{ticker} · Chart</h2>
          <p className="chart-name">{name}</p>
        </div>
        <span className="panel-tag">Placeholder</span>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label={`Illustrative price chart for ${ticker}`}
      >
        <div className="chart-grid" aria-hidden="true" />
        <div className="chart-line" aria-hidden="true" />
        <div className="chart-volume" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, index) => (
            <span
              key={index}
              className="chart-bar"
              style={{ height: `${20 + ((index * 37) % 70)}%` }}
            />
          ))}
        </div>
      </div>
      <IndicatorChips />
    </section>
  );
}
