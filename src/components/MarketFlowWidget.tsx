import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";
import { dataSource } from "../lib/datasource";
import { Dropdown } from "./Dropdown";
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
  // Which on-card selector to render: a droplist (sector/industry) or the gold
  // Previous/Next toggle (stock). Market has neither.
  control?: "dropdown" | "prevnext";
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

  // Names in the watch that have stock-level weather — the universe the Stock
  // card's Previous/Next toggle cycles through (kept in watch order).
  const stockOptions = useMemo(
    () => watchTickers.filter((ticker) => snapshot.stocks[ticker]),
    [watchTickers, snapshot],
  );

  // Sector/Industry default to the focused stock's (or the first watch name's).
  const baseTicker = focusTicker ?? watchTickers[0] ?? null;
  const baseInfo = baseTicker ? dataSource.getTickerInfo(baseTicker) : undefined;

  // Local overrides for the focus-driven sector/industry/stock. These stay inside
  // Market Weather — stepping them never changes the Current Watch selection. They
  // reset when the focused name changes so a watch pick still drives all layers.
  const [pillSector, setPillSector] = useState<string | null>(null);
  const [pillIndustry, setPillIndustry] = useState<string | null>(null);
  const [pillStock, setPillStock] = useState<string | null>(null);
  useEffect(() => {
    setPillSector(null);
    setPillIndustry(null);
    setPillStock(null);
  }, [focusTicker]);

  const activeSector = pillSector ?? baseInfo?.sector ?? sectorOptions[0] ?? null;
  const activeIndustry =
    pillIndustry ?? baseInfo?.industry ?? industryOptions[0] ?? null;
  // Stock defaults to the focused (or first watch) name so the card reads a name
  // out of the box; Previous/Next then cycles locally without touching the watch.
  const activeStock = pillStock ?? focusTicker ?? stockOptions[0] ?? null;

  const marketReading = snapshot.market;
  const sectorReading = activeSector ? snapshot.sectors[activeSector] : undefined;
  const industryReading = activeIndustry
    ? snapshot.industries[activeIndustry]
    : undefined;
  const stockReading = activeStock ? snapshot.stocks[activeStock] : undefined;

  const [selectedLayer, setSelectedLayer] = useState<MarketWeatherLayer | null>(null);

  const cards: LayerCard[] = [
    { layer: "market", reading: marketReading },
    {
      layer: "sector",
      reading: sectorReading,
      options: sectorOptions,
      active: activeSector,
      onPick: setPillSector,
      control: "dropdown",
    },
    {
      layer: "industry",
      reading: industryReading,
      options: industryOptions,
      active: activeIndustry,
      onPick: setPillIndustry,
      control: "dropdown",
    },
    {
      layer: "stock",
      reading: stockReading,
      options: stockOptions,
      active: activeStock,
      onPick: setPillStock,
      control: "prevnext",
    },
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
          // The on-card selector (sector/industry droplist or the stock
          // Previous/Next toggle) only shows when there's more than one option
          // to move between.
          const showSwitch = options.length > 1 && Boolean(card.active);
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
                  is click-through (pointer-events: none) EXCEPT the on-card
                  selectors (sector/industry droplist, stock Previous/Next),
                  which float above and handle their own clicks without
                  triggering navigation. */}
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
                {showSwitch && card.control === "dropdown" ? (
                  <div className="weather-select">
                    <Dropdown
                      variant="on-graphics"
                      id={`weather-${card.layer}-select`}
                      label={`Switch ${LAYER_LABEL[card.layer].toLowerCase()}`}
                      value={card.active!}
                      onChange={(value) => card.onPick?.(value)}
                      options={options.map((option) => ({
                        value: option,
                        label: option,
                      }))}
                    />
                  </div>
                ) : null}
                {showSwitch && card.control === "prevnext" ? (
                  <div
                    className="weather-prevnext"
                    role="group"
                    aria-label="Switch stock"
                  >
                    <button
                      type="button"
                      className="weather-prevnext-btn"
                      aria-label="Previous stock"
                      onClick={() => card.onPick?.(stepOption(options, card.active!, -1))}
                    >
                      <CaretLeft weight="bold" aria-hidden />
                      Previous
                    </button>
                    <button
                      type="button"
                      className="weather-prevnext-btn"
                      aria-label="Next stock"
                      onClick={() => card.onPick?.(stepOption(options, card.active!, 1))}
                    >
                      Next
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
