import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceState } from "../state/AppState";
import { dataSource } from "../lib/datasource";
import { getWatchMarketWeather } from "../lib/datasource/freeTier";
import {
  getLiveCacheGeneration,
  getMarketCycleMeta,
  getWeatherTaxonomyReadiness,
  resolveWeatherTaxonomyEtaAt,
  subscribeLiveCache,
  synthesizeNextCycleEtaAt,
} from "../lib/market/liveCache";
import { ensureWeatherTaxonomyAwaiting } from "../lib/weather/hydrateTaxonomy";
import { SearchableSelect } from "./SearchableSelect";
import { NeedsDataReviewFlag } from "./NeedsDataReviewFlag";
import { ForgeToast } from "./forge/ForgeToast";
import { ForgePill } from "./ForgePill";
import { Tooltip } from "./Tooltip";
import { WeatherEvidence } from "./WeatherEvidence";
import { CaretDown, CaretLeft, CaretRight, Timer } from "../lib/icons";
import {
  getMarketSession,
  resolveWeatherGraphic,
  SESSION_META,
  SEVERITY_TONE,
  WEATHER_CONDITIONS,
  type WeatherGraphic,
} from "../lib/weather";
import {
  formatCheckCountdown,
  formatCheckTime,
  formatDecimals,
} from "../lib/format";
import type {
  MarketWeatherLayer,
  WeatherLayerReading,
  WeatherSubScores,
} from "../lib/weather";

/** Detail-view footer — conditions are a read, not a forecast. */
const WEATHER_SNAPSHOT_DISCLAIMER =
  "This is a snapshot of how conditions look right now — not a prediction of where the market will go.";

const WEATHER_SCHEDULE_TOAST_STORAGE_KEY = "st-weather-schedule-collapsed";

function readWeatherScheduleCollapsed(): boolean {
  try {
    return sessionStorage.getItem(WEATHER_SCHEDULE_TOAST_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeWeatherScheduleCollapsed(collapsed: boolean) {
  try {
    if (collapsed) {
      sessionStorage.setItem(WEATHER_SCHEDULE_TOAST_STORAGE_KEY, "1");
    } else {
      sessionStorage.removeItem(WEATHER_SCHEDULE_TOAST_STORAGE_KEY);
    }
  } catch {
    /* private mode — in-session state still works */
  }
}

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
  const { watchlist, markWeatherReaderLayer } = useWorkspaceState();
  const [liveGeneration, setLiveGeneration] = useState(getLiveCacheGeneration);
  useEffect(() => subscribeLiveCache(() => setLiveGeneration(getLiveCacheGeneration())), []);

  const [scheduleToastCollapsed, setScheduleToastCollapsed] = useState(
    readWeatherScheduleCollapsed,
  );
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  // Session detection picks which weather to read. The snapshot is fetched
  // ONCE per session, then stock readings are augmented for every watched
  // name that has mapped GICS sector/industry (client-side; no Yahoo fan-out).
  const session = getMarketSession();
  const cycleMeta = useMemo(() => getMarketCycleMeta(), [liveGeneration]);
  const nextWeatherAt =
    cycleMeta?.nextCycleAt ?? synthesizeNextCycleEtaAt();
  const lastWeatherAt =
    cycleMeta?.completedAt ?? cycleMeta?.publishedAt ?? cycleMeta?.cycleAsOf ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const weatherCountdown = formatCheckCountdown(
    Date.parse(nextWeatherAt) - countdownNow,
  );
  const scheduleLastLabel = lastWeatherAt
    ? formatCheckTime(lastWeatherAt)
    : "Waiting on first cycle";
  const scheduleNextLabel = `${formatCheckTime(nextWeatherAt)} (${weatherCountdown})`;

  function setScheduleCollapsed(collapsed: boolean) {
    writeWeatherScheduleCollapsed(collapsed);
    setScheduleToastCollapsed(collapsed);
  }

  const scheduleToggle = (
    <button
      type="button"
      className={
        scheduleToastCollapsed ? "icon-btn" : "icon-btn icon-btn--active"
      }
      aria-label={
        scheduleToastCollapsed
          ? "Show weather schedule"
          : "Minimize weather schedule"
      }
      aria-expanded={!scheduleToastCollapsed}
      onClick={() => setScheduleCollapsed(!scheduleToastCollapsed)}
    >
      <Timer aria-hidden weight="regular" />
    </button>
  );

  const scheduleToast = !scheduleToastCollapsed ? (
    <div className="forge-toast-stack weather-schedule-toast">
      <ForgeToast
        tone="info"
        onDismiss={() => setScheduleCollapsed(true)}
        dismissLabel="Minimize weather schedule"
      >
        <p>
          Last Weather Cycle: {scheduleLastLabel}
          {` · Next Cycle: ${scheduleNextLabel}`}
        </p>
      </ForgeToast>
    </div>
  ) : null;

  const snapshot = useMemo(
    () =>
      getWatchMarketWeather(
        session,
        watchlist.map((item) => item.ticker),
      ),
    // liveGeneration: taxonomy / context refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, watchlist, liveGeneration],
  );

  // The stock universe = every name in the current watch (alpha order for
  // Previous/Next), whether or not weather data is mapped yet.
  const watchTickers = useMemo(
    () =>
      [...new Set(watchlist.map((item) => item.ticker.toUpperCase()))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [watchlist],
  );
  const stockList = watchTickers;

  // Returning session / leave: pending until cycle taxonomy lands — never a
  // false "No Sector associated" while waiting.
  useEffect(() => {
    ensureWeatherTaxonomyAwaiting(watchTickers);
  }, [watchTickers, liveGeneration]);

  function weatherTaxonomyEmptyCopy(
    layer: "sector" | "industry" | "stock",
    ticker: string | null,
  ): { kind: "pending" | "failed"; text: string } {
    const failedLabel =
      layer === "sector"
        ? "No Sector associated"
        : layer === "industry"
          ? "No Industry associated"
          : "No Stock Weather available";
    if (!ticker) {
      return { kind: "failed", text: failedLabel };
    }
    const readiness = getWeatherTaxonomyReadiness(ticker);
    if (readiness?.status === "failed") {
      return { kind: "failed", text: failedLabel };
    }
    // pending / idle / awaiting cycle — always show mm:ss (soft queue or cycle).
    const etaAt =
      resolveWeatherTaxonomyEtaAt(ticker, countdownNow) ??
      synthesizeNextCycleEtaAt(countdownNow);
    const countdown = formatCheckCountdown(Date.parse(etaAt) - countdownNow);
    return {
      kind: "pending",
      text: `Pending weather check (${countdown})`,
    };
  }

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
    if (ticker && (info?.sector || info?.industry)) {
      return {
        sector: info?.sector ?? null,
        industry: info?.industry ?? null,
        stock: ticker,
      };
    }
    // Focused / watched name with no GICS mapping yet — keep the ticker on
    // Stock; do not invent a catalog sector.
    if (ticker) {
      return { sector: null, industry: null, stock: ticker };
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

  // The watch-driven base = the focused name (or the first watch name).
  // Selecting a name in Current Watch refocuses every layer; local dropdown /
  // Prev-Next overrides then persist until the base changes again.
  const baseTicker = focusTicker?.toUpperCase() ?? watchTickers[0] ?? null;
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const openLayerDetail = useCallback(
    (layer: MarketWeatherLayer) => {
      setSelectedLayer(layer);
      setShowAdvanced(false);
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
          <div className="market-flow-head-meta">
            <span className="panel-tag">{LAYER_LABEL[selectedLayer]}</span>
            {scheduleToggle}
          </div>
        </div>
        <button
          type="button"
          className="breadcrumb flow-breadcrumb"
          onClick={() => setSelectedLayer(null)}
        >
          <CaretLeft aria-hidden />
          Market Weather
        </button>
        {scheduleToast}
        <div className={`flow-summary weather-summary ${graphic.accentClass}`}>
          <WeatherBackdrop graphic={graphic} variant="summary" />
          <div className="flow-summary-content">
            <header className="flow-summary-head">
              <span className="flow-index">{index + 1}</span>
              <span className="flow-summary-titles">
                <span className="flow-label">{detailReading.label}</span>
                {detailReading.availability === "unavailable" ? (
                  <span className="chip status--neutral weather-condition-chip">
                    Independent weather unavailable
                  </span>
                ) : (
                  <ConditionChip reading={detailReading} />
                )}
              </span>
            </header>
            {detailReading.modelVersion === "v2" ? (
              <>
                <WeatherEvidence reading={detailReading} />
                {detailReading.availability !== "unavailable" ? (
                  <div
                    className={
                      showAdvanced
                        ? "watch-plan-section is-expanded"
                        : "watch-plan-section"
                    }
                  >
                    <button
                      type="button"
                      className="watch-plan-section-toggle"
                      aria-expanded={showAdvanced}
                      aria-controls={`weather-advanced-${selectedLayer}`}
                      onClick={() => setShowAdvanced((current) => !current)}
                    >
                      <span className="config-label forge-label">
                        Advanced Details
                      </span>
                      <CaretDown
                        className="watch-plan-section-caret"
                        aria-hidden
                        weight="regular"
                      />
                    </button>
                    {showAdvanced ? (
                      <div
                        id={`weather-advanced-${selectedLayer}`}
                        className="watch-plan-section-body"
                      >
                        <div className="weather-advanced">
                          {detailReading.dataPoints?.length ? (
                            <div className="watch-summary-chip-group">
                              <span className="config-label forge-label">
                                Weather Data Points
                              </span>
                              <div className="forge-box-body">
                                {detailReading.dataPoints.map((point) => (
                                  <Tooltip
                                    key={`${point.label}-${point.value}`}
                                    title={`${point.label} ${point.value}`}
                                    body={point.detail}
                                    wide
                                  >
                                    <ForgePill>
                                      {point.label} {point.value}
                                    </ForgePill>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <p className="weather-score-line">
                            Coverage: {detailReading.coverage ?? "partial"} · Model:
                            Weather V2
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="weather-score-line">
                  Score {formatDecimals(detailReading.score)}/100
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
              </>
            )}
            {detailReading.modelVersion === "v2" ? (
              detailReading.longTermTrend ? (
                <p className="weather-climate">
                  <strong>Long-term trend:</strong>{" "}
                  {detailReading.longTermTrend}
                </p>
              ) : null
            ) : (
              <p className="weather-climate">
                <strong>Climate:</strong> {detailReading.climateContext.note}
              </p>
            )}
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
        <div className="market-flow-head-meta">
          <span className="panel-tag session-tag">{SESSION_META[session].label}</span>
          {scheduleToggle}
        </div>
      </div>
      <p className="panel-intro">
        See if your names sail with the weather or fight the wind — Market down
        to Stock.
      </p>
      {scheduleToast}
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
            card.layer === "stock" && (reading?.label || card.active)
              ? (reading?.label ?? card.active!)
              : LAYER_LABEL[card.layer];
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
                    ? reading.availability === "unavailable"
                      ? `${cardLabel}: independent weather unavailable. View details.`
                      : `${cardLabel}: ${WEATHER_CONDITIONS[reading.conditionId].label}. View details.`
                    : undefined
                }
              />
              <div className="weather-overlay">
                <div className="weather-headpill" aria-hidden="true">
                  <span className="flow-index">{index + 1}</span>
                  <span className="weather-layer">{cardLabel}</span>
                  {reading ? (
                    reading.availability === "unavailable" ? (
                      <span className="chip status--neutral weather-condition-chip">
                        Unavailable
                      </span>
                    ) : (
                      <ConditionChip reading={reading} />
                    )
                  ) : null}
                </div>
                {!reading ? (
                  <div className="weather-empty">
                    {(() => {
                      if (card.layer === "stock" && card.active) {
                        const empty = weatherTaxonomyEmptyCopy(
                          "stock",
                          card.active,
                        );
                        return empty.kind === "failed" ? (
                          <NeedsDataReviewFlag label={empty.text} />
                        ) : (
                          <p className="weather-empty-copy">{empty.text}</p>
                        );
                      }
                      if (card.layer === "sector" && sel.stock && !sel.sector) {
                        const empty = weatherTaxonomyEmptyCopy(
                          "sector",
                          sel.stock,
                        );
                        return empty.kind === "failed" ? (
                          <NeedsDataReviewFlag label={empty.text} />
                        ) : (
                          <p className="weather-empty-copy">{empty.text}</p>
                        );
                      }
                      if (
                        card.layer === "industry" &&
                        sel.stock &&
                        !sel.industry
                      ) {
                        const empty = weatherTaxonomyEmptyCopy(
                          "industry",
                          sel.stock,
                        );
                        return empty.kind === "failed" ? (
                          <NeedsDataReviewFlag label={empty.text} />
                        ) : (
                          <p className="weather-empty-copy">{empty.text}</p>
                        );
                      }
                      return (
                        <p className="weather-empty-copy">
                          {card.layer === "stock" && options.length > 0
                            ? "No watched name in this group — use Previous / Next to jump to one."
                            : "Add a name to Current Watch to read its weather."}
                        </p>
                      );
                    })()}
                  </div>
                ) : null}
                {reading ? (
                  <div className="weather-card-description">
                    <p className="weather-card-summary">
                      {reading.summary ?? reading.explanation}
                    </p>
                    <span className="weather-card-more" aria-hidden="true">
                      View forecast →
                    </span>
                  </div>
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
