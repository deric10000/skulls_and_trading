const INDICATOR_TAGS = [
  "RSI",
  "VWAP",
  "Volume",
  "MA 10",
  "MA 20",
  "MA 50",
  "Support",
  "Resistance",
  "Trend",
];

export function IndicatorChips() {
  return (
    <ul className="indicator-tags" aria-label="Indicators on watch">
      {INDICATOR_TAGS.map((tag) => (
        <li key={tag} className="chip indicator-tag">
          {tag}
        </li>
      ))}
    </ul>
  );
}
