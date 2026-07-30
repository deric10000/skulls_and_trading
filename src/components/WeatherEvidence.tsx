import type { WeatherLayerReading } from "../lib/weather";
import { formatCheckTime, formatDecimals } from "../lib/format";

export function WeatherCheckedAt({
  reading,
}: {
  reading: WeatherLayerReading;
}) {
  return (
    <span className="watch-field-label watch-field-label--right weather-checked-at">
      Checked as of {formatCheckTime(reading.lastUpdated)}
    </span>
  );
}

export function WeatherEvidence({
  reading,
}: {
  reading: WeatherLayerReading;
}) {
  if (reading.modelVersion !== "v2") {
    return null;
  }

  return (
    <div className="weather-evidence" aria-label="Weather evidence">
      <span className="config-label forge-label">Weather Forecast</span>
      <p className="weather-evidence-description">{reading.explanation}</p>
      {reading.availability !== "unavailable" && reading.evidence?.length ? (
        <div className="watch-summary-my-plan weather-score-section">
          <span className="config-label forge-label">
            Skulls and Trading Weather Index
          </span>
          <p className="weather-score-line">
            Total <strong>{formatDecimals(reading.score)}/100</strong>
          </p>
          <div className="weather-evidence-grid">
            {reading.evidence.map((row) => (
              <span className="weather-evidence-item" key={row.label}>
                {row.label} <strong>{row.value}</strong>
              </span>
            ))}
            <span className="weather-evidence-item">
              Coverage <strong>{reading.coverage ?? "partial"}</strong>
            </span>
          </div>
        </div>
      ) : null}
      <WeatherCheckedAt reading={reading} />
    </div>
  );
}
