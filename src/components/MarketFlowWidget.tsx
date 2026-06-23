import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";
import { dataSource } from "../lib/datasource";
import { CaretLeft, CaretRight, SealPercent } from "../lib/icons";
import {
  confidenceTone,
  getMarketSession,
  resolveWeatherGraphic,
  SESSION_META,
  SEVERITY_TONE,
  WEATHER_CONDITIONS,
  type WeatherGraphic,
} from "../lib/weather";
import type {
  MarketWeatherLayer,
  WeatherLayerReading,
  WeatherSubScores,
} from "../lib/weather";

// Beginner-friendly tooltip copy for the five instruments (product spec).
const SUBSCORE_META: {
  key: keyof WeatherSubScores;
  label: string;
  hint: string;
}[] = [
  { key: "trend", label: "Trend", hint: "Is price actually moving up or down?" },
  {
    key: "breadth",
    label: "Breadth",
    hint: "Are many stocks participating, or only a few?",
  },
  { key: "volatility", label: "Volatility", hint: "Is fear rising or fading?" },
  {
    key: "riskAppetite",
    label: "Risk Appetite",
    hint: "Are investors buying aggressive assets or hiding in safety?",
  },
  { key: "rotation", label: "Rotation", hint: "Where is money moving?" },
];

const LAYER_LABEL: Record<MarketWeatherLayer, string> = {
  market: "Market",
  sector: "Sector",
  industry: "Industry",
  stock: "Stock",
};

const LAYER_ORDER: MarketWeatherLayer[] = ["market", "sector", "industry", "stock"];

// Cycle to the prev/next option with wraparound (chevron stepper).
function stepOption(options: string[], current: string, direction: 1 | -1): string {
  const index = options.indexOf(current);
  const base = index < 0 ? 0 : index;
  const next = (base + direction + options.length) % options.length;
  return options[next];
}

// Condition chip — icon + label, tone-colored. The icon comes from the shared
// condition library (WEATHER_CONDITIONS[id].defaultIcon) so it's identical
// everywhere the chip is used.
function ConditionChip({ reading }: { reading: WeatherLayerReading }) {
  const condition = WEATHER_CONDITIONS[reading.conditionId];
  const Icon = condition.defaultIcon;
  return (
    <span
      className={`chip status--${SEVERITY_TONE[condition.severity]} weather-condition-chip`}
    >
      <Icon aria-hidden />
      {condition.label}
    </span>
  );
}

// Confidence chip — SealPercent icon + NN%. Colored by RANGE (high=positive,
// medium=warning, low=negative) via `confidenceTone`, independent of the
// condition's own tone (matches the Figma confidence chip set).
function ConfidenceChip({ value }: { value: number }) {
  return (
    <span className={`chip status--${confidenceTone(value)} weather-confidence-chip`}>
      <SealPercent aria-hidden />
      {value}%
    </span>
  );
}

// Condition backdrop: real artwork when available, gradient fallback otherwise.
// Decorative — the condition is already conveyed by the visible chip text.
function WeatherBackdrop({
  graphic,
  variant,
}: {
  graphic: WeatherGraphic;
  variant: "card" | "summary";
}) {
  if (graphic.kind === "image") {
    return (
      <img
        className={variant === "card" ? "flow-step-art" : "flow-summary-art"}
        src={graphic.src}
        alt=""
        aria-hidden="true"
      />
    );
  }
  return <div className={`weather-bg ${graphic.backgroundClass}`} aria-hidden />;
}

function SubScoreRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="weather-score-row" title={hint}>
      <span className="weather-score-label">{label}</span>
      <span className="weather-score-track" aria-hidden>
        <span className="weather-score-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="weather-score-value">{value}</span>
    </div>
  );
}

interface LayerCard {
  layer: MarketWeatherLayer;
  reading?: WeatherLayerReading;
  options?: string[];
  active?: string | null;
  onPick?: (value: string) => void;
}

export function MarketFlowWidget({
  focusTicker = null,
}: {
  /** Ticker selected in Current Watch; drives Sector/Industry/Stock focus. */
  focusTicker?: string | null;
}) {
  const { watchlist } = useAppState();

  // Session detection picks which weather to read. The snapshot is fetched (mock)
  // ONCE per session, app-wide, and filtered to the user's watch here.
  // >>> FUTURE API WIRING <<< swap dataSource.getMarketWeather for a real feed
  // that refreshes at each session boundary (see weather/mock.ts).
  const session = getMarketSession();
  const snapshot = dataSource.getMarketWeather(session);

  // Universe of names = the current watch; build sector/industry pills from it.
  const watchTickers = useMemo(
    () => watchlist.map((item) => item.ticker).filter((t) => dataSource.getTickerInfo(t)),
    [watchlist],
  );

  // Options are sorted alphabetically for predictable stepping; the *default*
  // selection still follows the focused/first watch stock (see activeSector).
  const sectorOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const ticker of watchTickers) {
      const sector = dataSource.getTickerInfo(ticker)?.sector;
      if (sector && snapshot.sectors[sector]) seen.add(sector);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [watchTickers, snapshot]);

  const industryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const ticker of watchTickers) {
      const industry = dataSource.getTickerInfo(ticker)?.industry;
      if (industry && snapshot.industries[industry]) seen.add(industry);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [watchTickers, snapshot]);

  // Sector/Industry default to the focused stock's (or the first watch name's).
  const baseTicker = focusTicker ?? watchTickers[0] ?? null;
  const baseInfo = baseTicker ? dataSource.getTickerInfo(baseTicker) : undefined;

  // Pills can override the focus-driven sector/industry; reset when focus changes.
  const [pillSector, setPillSector] = useState<string | null>(null);
  const [pillIndustry, setPillIndustry] = useState<string | null>(null);
  useEffect(() => {
    setPillSector(null);
    setPillIndustry(null);
  }, [focusTicker]);

  const activeSector = pillSector ?? baseInfo?.sector ?? sectorOptions[0] ?? null;
  const activeIndustry =
    pillIndustry ?? baseInfo?.industry ?? industryOptions[0] ?? null;

  const marketReading = snapshot.market;
  const sectorReading = activeSector ? snapshot.sectors[activeSector] : undefined;
  const industryReading = activeIndustry
    ? snapshot.industries[activeIndustry]
    : undefined;
  // Stock weather only shows once a name is explicitly selected in Current Watch.
  const stockReading = focusTicker ? snapshot.stocks[focusTicker] : undefined;

  const [selectedLayer, setSelectedLayer] = useState<MarketWeatherLayer | null>(null);

  const cards: LayerCard[] = [
    { layer: "market", reading: marketReading },
    {
      layer: "sector",
      reading: sectorReading,
      options: sectorOptions,
      active: activeSector,
      onPick: setPillSector,
    },
    {
      layer: "industry",
      reading: industryReading,
      options: industryOptions,
      active: activeIndustry,
      onPick: setPillIndustry,
    },
    { layer: "stock", reading: stockReading },
  ];

  const detailReading = cards.find((card) => card.layer === selectedLayer)?.reading;

  if (selectedLayer && detailReading) {
    const graphic = resolveWeatherGraphic(detailReading.conditionId);
    const index = LAYER_ORDER.indexOf(selectedLayer);
    return (
      <section className="panel market-flow" aria-labelledby="flow-title">
        <div className="panel-head">
          <h2 id="flow-title">Market Weather</h2>
          <span className="panel-tag">{LAYER_LABEL[selectedLayer]}</span>
        </div>
        <button
          type="button"
          className="breadcrumb flow-breadcrumb"
          onClick={() => setSelectedLayer(null)}
        >
          <CaretLeft aria-hidden />
          Market Weather
        </button>
        <div className={`flow-summary weather-summary ${graphic.accentClass}`}>
          <WeatherBackdrop graphic={graphic} variant="summary" />
          <div className="flow-summary-content">
            <header className="flow-summary-head">
              <span className="flow-index">{index + 1}</span>
              <span className="flow-summary-titles">
                <span className="flow-label">{detailReading.label}</span>
                <ConditionChip reading={detailReading} />
              </span>
            </header>
            <p className="weather-confidence-line">
              Confidence {detailReading.confidence}% · Score {detailReading.score}/100
            </p>
            <p className="flow-summary-note">{detailReading.explanation}</p>
            <p className="weather-why-line">
              <strong>Why:</strong> {detailReading.why}
            </p>
            <div className="weather-scores">
              {SUBSCORE_META.map((meta) => (
                <SubScoreRow
                  key={meta.key}
                  label={meta.label}
                  value={detailReading.subScores[meta.key]}
                  hint={meta.hint}
                />
              ))}
            </div>
            <p className="weather-climate">
              <strong>Climate:</strong> {detailReading.climateContext.note}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel market-flow" aria-labelledby="flow-title">
      <div className="panel-head">
        <h2 id="flow-title">Market Weather</h2>
        <span className="panel-tag">{SESSION_META[session].label}</span>
      </div>
      <p className="panel-intro">
        We don&rsquo;t predict the future — we read the conditions. Is your name
        moving with the weather, or against it? Work it from the top down.
      </p>
      <ol className="flow-steps flow-steps--vertical">
        {cards.map((card, index) => {
          const reading = card.reading;
          const graphic = reading
            ? resolveWeatherGraphic(reading.conditionId)
            : undefined;
          const isActive = selectedLayer === card.layer;
          const options = card.options ?? [];
          // Chevron toggle for cycling sectors/industries — only when there's
          // more than one watch group to scan through.
          const showStepper = options.length > 1;
          // The card label: the entity name (NVDA) for the stock card, else the
          // layer name (Market / Sector / Industry).
          const cardLabel =
            card.layer === "stock" && reading ? reading.label : LAYER_LABEL[card.layer];
          return (
            <li
              key={card.layer}
              className={[
                "flow-step select-card weather-card",
                graphic?.accentClass ?? "",
                isActive ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {graphic ? <WeatherBackdrop graphic={graphic} variant="card" /> : null}
              {/* Full-card hit target: clicking anywhere on the card opens the
                  detail view. It sits beneath the content overlay; the overlay
                  is click-through (pointer-events: none) EXCEPT the sector/
                  industry toggle, which floats above and handles its own clicks
                  without triggering navigation. */}
              <button
                type="button"
                className="weather-hit"
                onClick={() => reading && setSelectedLayer(card.layer)}
                aria-pressed={isActive}
                disabled={!reading}
                aria-label={
                  reading
                    ? `${cardLabel}: ${WEATHER_CONDITIONS[reading.conditionId].label}, confidence ${reading.confidence}%. View details.`
                    : undefined
                }
              />
              <div className="weather-overlay">
                <div className="weather-headpill" aria-hidden="true">
                  <span className="flow-index">{index + 1}</span>
                  <span className="weather-layer">{cardLabel}</span>
                  {reading ? (
                    <>
                      <ConditionChip reading={reading} />
                      <ConfidenceChip value={reading.confidence} />
                    </>
                  ) : null}
                </div>
                {!reading ? (
                  <p className="weather-empty">
                    Select a name in Current Watch to read its weather.
                  </p>
                ) : null}
                {showStepper && card.active ? (
                  <div
                    className="weather-switch"
                    role="group"
                    aria-label={`Switch ${LAYER_LABEL[card.layer].toLowerCase()}`}
                  >
                    <button
                      type="button"
                      className="weather-switch-arrow"
                      aria-label={`Previous ${LAYER_LABEL[card.layer].toLowerCase()}`}
                      onClick={() => card.onPick?.(stepOption(options, card.active!, -1))}
                    >
                      <CaretLeft weight="bold" aria-hidden />
                    </button>
                    <span className="weather-switch-label">{card.active}</span>
                    <button
                      type="button"
                      className="weather-switch-arrow"
                      aria-label={`Next ${LAYER_LABEL[card.layer].toLowerCase()}`}
                      onClick={() => card.onPick?.(stepOption(options, card.active!, 1))}
                    >
                      <CaretRight weight="bold" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
