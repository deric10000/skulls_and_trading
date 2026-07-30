import type { WeatherLayerReading } from "../lib/weather";

export function WeatherEvidence({
  reading,
}: {
  reading: WeatherLayerReading;
}) {
  if (
    reading.modelVersion !== "v2" ||
    reading.availability === "unavailable" ||
    !reading.evidence?.length
  ) {
    return null;
  }

  return (
    <div
      className="weather-evidence"
      aria-label="Weather evidence"
    >
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
  );
}
