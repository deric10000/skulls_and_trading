import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";
import { dataSource } from "../lib/datasource";
import { SearchableSelect } from "./SearchableSelect";
import { CaretLeft, CaretRight } from "../lib/icons";
import {
  getMarketSession,
  resolveWeatherGraphic,
  SESSION_META,
  SEVERITY_TONE,
  WEATHER_CONDITIONS,
  type WeatherGraphic,
} from "../lib/weather";
import { formatDecimals } from "../lib/format";
import type {
  MarketWeatherLayer,
  WeatherLayerReading,
  WeatherSubScores,
} from "../lib/weather";

/** Detail-view footer — conditions are a read, not a forecast. */
const WEATHER_SNAPSHOT_DISCLAIMER =
  "This is a snapshot of how conditions look right now — not a prediction of where the market will go.";

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
      <span className="weather-score-value">{formatDecimals(value)}</span>
    </div>
  );
}

interface LayerCard {
  layer: MarketWeatherLayer;
  reading?: WeatherLayerReading;
  options?: string[];
  active?: string | null;
  // Droplist pick (sector/industry).
  onPick?: (value: string) => void;
  // Previous/Next step (stock): +1 next, -1 previous.
  onStep?: (direction: 1 | -1) => void;
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
  const { watchlist, markWeatherReaderLayer } = useAppState();

  // Session detection picks which weather to read. The snapshot is fetched (mock)
  // ONCE per session, app-wide, and filtered to the user's watch here.
  // >>> FUTURE API WIRING <<< swap dataSource.getMarketWeather for a real feed
  // that refreshes at each session boundary (see weather/mock.ts).
  const session = getMarketSession();
  const snapshot = dataSource.getMarketWeather(session);

  // The stock universe = names in the current watch that have stock-level
  // weather, sorted ALPHABETICALLY (the order Previous/Next steps through).
  const watchTickers = useMemo(
    () => watchlist.map((item) => item.ticker).filter((t) => dataSource.getTickerInfo(t)),
    [watchlist],
  );
  const stockList = useMemo(
    () =>
      watchTickers
        .filter((ticker) => snapshot.stocks[ticker])
        .sort((a, b) => a.localeCompare(b)),
    [watchTickers, snapshot],
  );

  // Sector / Industry list the full GICS universe from the weather snapshot
  // (not the watch) so any slice is browsable. Industry options are scoped to
  // the selected sector for a relevant typeahead.
  const sectorOptions = useMemo(
    () => Object.keys(snapshot.sectors).sort((a, b) => a.localeCompare(b)),
    [snapshot],
  );
  // sector → its industries (alpha), from the snapshot taxonomy (GICS SSOT).
  const sectorIndustries = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [industry, sector] of Object.entries(snapshot.industrySectors)) {
      (map[sector] ??= []).push(industry);
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.localeCompare(b));
    return map;
  }, [snapshot]);

  // First watch name (alpha) sitting in a given industry, or null when you hold
  // none there (→ the Stock card goes disabled, but Previous/Next stays live).
  const firstStockInIndustry = useCallback(
    (industry: string | null) =>
      (industry
        ? stockList.find((t) => dataSource.getTickerInfo(t)?.industry === industry)
        : undefined) ?? null,
    [stockList],
  );

  // The cascade selection. Stock is the leaf: picking a name pins its sector +
  // industry. It lives entirely inside Market Weather — never mutates Current
  // Watch.
  type Selection = {
    sector: string | null;
    industry: string | null;
    stock: string | null;
  };
  const selectionForStock = useCallback((ticker: string | null): Selection => {
    const info = ticker ? dataSource.getTickerInfo(ticker) : undefined;
    if (info?.sector || info?.industry) {
      return {
        sector: info.sector ?? null,
        industry: info.industry ?? null,
        stock: ticker,
      };
    }
    // Empty watch: still open Market → Sector → Industry from catalog taxonomy.
    const sector = Object.keys(snapshot.sectors).sort((a, b) =>
      a.localeCompare(b),
    )[0] ?? null;
    const industry =
      (sector
        ? Object.entries(snapshot.industrySectors)
            .filter(([, s]) => s === sector)
            .map(([name]) => name)
            .sort((a, b) => a.localeCompare(b))[0]
        : null) ??
      Object.keys(snapshot.industries).sort((a, b) => a.localeCompare(b))[0] ??
      null;
    return { sector, industry, stock: null };
  }, [snapshot]);

  // The watch-driven base = the focused name (or the first watch name, in watch
  // order — only Prev/Next stepping is alphabetical). Selecting a name in Current
  // Watch refocuses every layer; local dropdown / Prev-Next overrides then
  // persist until the base changes again. With no watch names, base stays null
  // and selectionForStock picks the first catalog sector/industry.
  const baseTicker =
    focusTicker ?? watchTickers.find((ticker) => snapshot.stocks[ticker]) ?? null;
  const [sel, setSel] = useState<Selection>(() => selectionForStock(baseTicker));
  useEffect(() => {
    setSel(selectionForStock(baseTicker));
  }, [baseTicker, selectionForStock]);

  // Sector change → first industry in that sector (alpha) → first watch name in
  // that industry (or disabled if none).
  const selectSector = (sector: string) => {
    const industry = sectorIndustries[sector]?.[0] ?? null;
    setSel({ sector, industry, stock: firstStockInIndustry(industry) });
  };
  // Industry change → its parent sector → first watch name in that industry.
  const selectIndustry = (industry: string) => {
    setSel({
      sector: snapshot.industrySectors[industry] ?? null,
      industry,
      stock: firstStockInIndustry(industry),
    });
  };
  // Stock Previous/Next cycles the whole watch list (alpha), syncing sector +
  // industry to the chosen name. From a disabled card: Next = first, Prev = last.
  const stepStock = (direction: 1 | -1) => {
    if (stockList.length === 0) return;
    const next = sel.stock
      ? stepOption(stockList, sel.stock, direction)
      : direction === 1
        ? stockList[0]
        : stockList[stockList.length - 1];
    setSel(selectionForStock(next));
  };

  const marketReading = snapshot.market;
  const sectorReading = sel.sector ? snapshot.sectors[sel.sector] : undefined;
  const industryReading = sel.industry ? snapshot.industries[sel.industry] : undefined;
  const stockReading = sel.stock ? snapshot.stocks[sel.stock] : undefined;
  const industryOptions = sel.sector
    ? (sectorIndustries[sel.sector] ?? [])
    : Object.keys(snapshot.industries).sort((a, b) => a.localeCompare(b));

  const [selectedLayer, setSelectedLayer] = useState<MarketWeatherLayer | null>(null);

  const openLayerDetail = useCallback(
    (layer: MarketWeatherLayer) => {
      setSelectedLayer(layer);
      markWeatherReaderLayer(layer);
    },
    [markWeatherReaderLayer],
  );

  const cards: LayerCard[] = [
    { layer: "market", reading: marketReading },
    {
      layer: "sector",
      reading: sectorReading,
      options: sectorOptions,
      active: sel.sector,
      onPick: selectSector,
      control: "dropdown",
    },
    {
      layer: "industry",
      reading: industryReading,
      options: industryOptions,
      active: sel.industry,
      onPick: selectIndustry,
      control: "dropdown",
    },
    {
      layer: "stock",
      reading: stockReading,
      options: stockList,
      active: sel.stock,
      onStep: stepStock,
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
            <p className="weather-score-line">
              Score {formatDecimals(detailReading.score)}/100
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
            <p className="weather-disclaimer">{WEATHER_SNAPSHOT_DISCLAIMER}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel market-flow" aria-labelledby="flow-title">
      <div className="panel-head">
        <h2 id="flow-title">Market Weather</h2>
        <span className="panel-tag session-tag">{SESSION_META[session].label}</span>
      </div>
      <p className="panel-intro">
        See if your names sail with the weather or fight the wind — Market down
        to Stock.
      </p>
      <ol className="flow-steps flow-steps--vertical">
        {cards.map((card, index) => {
          const reading = card.reading;
          const graphic = reading
            ? resolveWeatherGraphic(reading.conditionId)
            : undefined;
          const isActive = selectedLayer === card.layer;
          const options = card.options ?? [];
          // Sector/Industry droplist shows when there's a group to read. The
          // stock Previous/Next stays live whenever the watch has ANY name to
          // jump to — even on a disabled (no-match) card, so you can escape back.
          const showDropdown =
            card.control === "dropdown" && options.length > 1 && Boolean(card.active);
          const showPrevNext = card.control === "prevnext" && options.length > 0;
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
                onClick={() => reading && openLayerDetail(card.layer)}
                aria-pressed={isActive}
                disabled={!reading}
                aria-label={
                  reading
                    ? `${cardLabel}: ${WEATHER_CONDITIONS[reading.conditionId].label}, score ${formatDecimals(reading.score)}/100. View details.`
                    : undefined
                }
              />
              <div className="weather-overlay">
                <div className="weather-headpill" aria-hidden="true">
                  <span className="flow-index">{index + 1}</span>
                  <span className="weather-layer">{cardLabel}</span>
                  {reading ? <ConditionChip reading={reading} /> : null}
                </div>
                {!reading ? (
                  <p className="weather-empty">
                    {card.layer === "stock" && options.length > 0
                      ? "No watched name in this group — use Previous / Next to jump to one."
                      : "Add a name to Current Watch to read its weather."}
                  </p>
                ) : null}
                {showDropdown ? (
                  <div className="weather-select">
                    <SearchableSelect
                      variant="on-graphics"
                      id={`weather-${card.layer}-select`}
                      label={`Switch ${LAYER_LABEL[card.layer].toLowerCase()}`}
                      value={card.active!}
                      onChange={(value) => card.onPick?.(value)}
                      searchPlaceholder={`Search ${LAYER_LABEL[card.layer].toLowerCase()}…`}
                      options={options.map((option) => ({
                        value: option,
                        label: option,
                      }))}
                    />
                  </div>
                ) : null}
                {showPrevNext ? (
                  <div
                    className="weather-prevnext"
                    role="group"
                    aria-label="Switch stock"
                  >
                    <button
                      type="button"
                      className="weather-prevnext-btn"
                      aria-label="Previous stock"
                      onClick={() => card.onStep?.(-1)}
                    >
                      <CaretLeft weight="bold" aria-hidden />
                      Previous
                    </button>
                    <button
                      type="button"
                      className="weather-prevnext-btn"
                      aria-label="Next stock"
                      onClick={() => card.onStep?.(1)}
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
