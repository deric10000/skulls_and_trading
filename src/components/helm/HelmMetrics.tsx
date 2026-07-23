import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useAppState } from "../../state/AppState";
import { dataSource } from "../../lib/datasource";
import { computePortfolioAlignment } from "../../lib/forge/alignment";
import {
  buildConvictionChangeView,
  formatConvictionDelta,
  portfolioConvictionSeries,
  type ConvictionChangeView,
  type TickerConvictionMark,
} from "../../lib/forge/convictionChange";
import { computeHelmMetrics } from "../../lib/forge/helmMetrics";
import {
  shouldScoreTickerWithStrategy,
  strategiesForHolding,
} from "../../lib/forge/tickerStrategy";
import {
  DEFAULT_HELM_TIMEFRAME,
  HELM_TIMEFRAME_LABEL,
  clampHelmTimeframe,
  clipSparkPointsThrough,
  displaySparkPointsForRange,
  etIsoDate,
  helmCadenceFloorForScope,
  helmTimeframeBounds,
  mergeConvictionSparkByDay,
  seriesToConvictionSparkPoints,
  seriesToSparkPoints,
  sparkRangeShowsPointMarkers,
  type HelmTimeframe,
  type SparkPoint,
} from "../../lib/finance/portfolioSnapshotSeries";
import {
  countActions,
  countNotifications,
  computeZoneFollowedImpact,
  mergeCheckEventsWithProxies,
  type ForgeCheckEvent,
  type TickerPriceMark,
} from "../../lib/forge/planAdherence";
import {
  fetchConvictionSnapshots,
  fetchForgeCheckEvents,
  fetchPortfolioSnapshots,
} from "../../lib/userStore";
import { formatChange, formatDecimals } from "../../lib/format";
import { STATUS_TONE } from "../../lib/status";
import type { SignalTone } from "../../types";
import { PortfolioCompass } from "../PortfolioCompass";
import { StatusStack } from "../StatusBadge";
import { StrategyScopeSelect } from "../StrategyScopeSelect";

/** ET session day of the latest Last Conviction Check for the active scope. */
function lastCheckSeedTime(
  pullMap: Record<string, string>,
  strategyId: string | null | undefined,
  appliedStrategyIds: string[],
): string {
  const ids = strategyId ? [strategyId] : appliedStrategyIds;
  let latestMs = 0;
  let latestIso: string | undefined;
  for (const id of ids) {
    const pull = pullMap[id];
    if (!pull) continue;
    const ms = Date.parse(pull);
    if (!Number.isNaN(ms) && ms >= latestMs) {
      latestMs = ms;
      latestIso = pull;
    }
  }
  return latestIso ? etIsoDate(latestIso) : etIsoDate();
}

const SparklineChart = lazy(() =>
  import("../charts/SparklineChart").then((mod) => ({
    default: mod.SparklineChart,
  })),
);

const TONE_LABEL: Record<SignalTone, string> = {
  positive: "On Plan",
  neutral: "Watch",
  warning: "Review",
  negative: "Off Plan",
};

function formatSparkDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

/** Axis labels: single-day seed shows start date + "Pending Check." */
function sparkAxisLabels(points: SparkPoint[]): { start: string; end: string } {
  if (points.length === 0) return { start: "", end: "" };
  const start = formatSparkDate(points[0]!.time);
  if (points.length === 1) return { start, end: "Pending Check." };
  return {
    start,
    end: formatSparkDate(points[points.length - 1]!.time),
  };
}

function resolveCssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value || fallback;
}

/**
 * The Helm — derived progress metrics for the portfolio selected in Current
 * Watch (mirrored via shared AppState). Strategy scope is shared Home state
 * (`watchStrategyScopeId`) so Progress and Current Watch filter together.
 * Open P&L and Total Conviction history load from portfolio_snapshots
 * (additive; scoring unchanged). Shared spark range defaults to 1 week.
 */
export function HelmMetrics() {
  const {
    portfolios,
    strategies,
    buckets,
    getPortfolioAlignment,
    selectedPortfolioId,
    watchStrategyScopeId,
    setWatchStrategyScopeId,
    isConvictionScoreReady,
    lastDataPullAtByStrategyId,
    shareFills,
  } = useAppState();

  const portfolio = useMemo(
    () =>
      portfolios.find((p) => p.id === selectedPortfolioId) ?? portfolios[0],
    [portfolios, selectedPortfolioId],
  );

  const appliedStrategies = useMemo(
    () =>
      portfolio
        ? strategies
            .filter((s) => (s.appliedPortfolioIds ?? []).includes(portfolio.id))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [strategies, portfolio],
  );

  const [pnlSparkPoints, setPnlSparkPoints] = useState<SparkPoint[]>([]);
  const [convictionSparkPoints, setConvictionSparkPoints] = useState<
    SparkPoint[]
  >([]);
  const [sparkLoaded, setSparkLoaded] = useState(false);
  const [convictionView, setConvictionView] =
    useState<ConvictionChangeView | null>(null);
  const [checkEvents, setCheckEvents] = useState<ForgeCheckEvent[]>([]);
  const [priceMarks, setPriceMarks] = useState<TickerPriceMark[]>([]);
  const [adherenceLoaded, setAdherenceLoaded] = useState(false);
  // Shared Helm timeframe (default 1 week). Toggle UI later — all Progress +
  // Plan Adherence tiles read this same value / label.
  const [helmTimeframe] = useState<HelmTimeframe>(DEFAULT_HELM_TIMEFRAME);

  // Drop a stale shared scope when the mirrored portfolio no longer applies it.
  useEffect(() => {
    if (
      watchStrategyScopeId &&
      !appliedStrategies.some((s) => s.id === watchStrategyScopeId)
    ) {
      setWatchStrategyScopeId(null);
    }
  }, [appliedStrategies, watchStrategyScopeId, setWatchStrategyScopeId]);

  const focusedStrategy = useMemo(
    () =>
      watchStrategyScopeId
        ? appliedStrategies.find((s) => s.id === watchStrategyScopeId)
        : undefined,
    [appliedStrategies, watchStrategyScopeId],
  );

  const cadenceFloor = useMemo(
    () =>
      helmCadenceFloorForScope(appliedStrategies, watchStrategyScopeId),
    [appliedStrategies, watchStrategyScopeId],
  );
  const sparkRange = clampHelmTimeframe(helmTimeframe, cadenceFloor);
  const sparkRangeLabel = HELM_TIMEFRAME_LABEL[sparkRange];
  const showPointMarkers = sparkRangeShowsPointMarkers(sparkRange);
  const timeframeBounds = useMemo(
    () => helmTimeframeBounds(sparkRange),
    [sparkRange],
  );

  const alignment = useMemo(() => {
    if (!portfolio) return undefined;
    return focusedStrategy
      ? computePortfolioAlignment(portfolio, buckets, [focusedStrategy])
      : getPortfolioAlignment(portfolio.id);
  }, [portfolio, focusedStrategy, buckets, getPortfolioAlignment]);

  const metrics = useMemo(() => {
    if (!portfolio || !alignment) return undefined;
    const portfolioId = portfolio.id;
    const strategy = focusedStrategy;
    return computeHelmMetrics({
      portfolio,
      alignment,
      priceOf: (ticker) => dataSource.getTickerInfo(ticker)?.lastPrice ?? 0,
      tickerInScope: strategy
        ? (ticker) => {
            const holding = portfolio.holdings.find((h) => h.ticker === ticker);
            return (
              holding != null &&
              shouldScoreTickerWithStrategy(holding, strategy, portfolioId)
            );
          }
        : undefined,
      isScoreReady: (ticker) => {
        const holding = portfolio.holdings.find((h) => h.ticker === ticker);
        if (!holding) return true;
        const strategyIds = strategy
          ? shouldScoreTickerWithStrategy(holding, strategy, portfolioId)
            ? [strategy.id]
            : []
          : strategiesForHolding(holding, portfolioId, strategies).map(
              (item) => item.id,
            );
        return isConvictionScoreReady(portfolioId, ticker, strategyIds);
      },
    });
  }, [
    portfolio,
    alignment,
    focusedStrategy,
    strategies,
    isConvictionScoreReady,
    lastDataPullAtByStrategyId,
  ]);

  useEffect(() => {
    if (!portfolio || !alignment) {
      setPnlSparkPoints([]);
      setConvictionSparkPoints([]);
      setSparkLoaded(false);
      setConvictionView(null);
      setCheckEvents([]);
      setPriceMarks([]);
      setAdherenceLoaded(false);
      return;
    }
    let cancelled = false;
    setSparkLoaded(false);
    setAdherenceLoaded(false);

    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 21);
    const fromStr = from.toISOString().slice(0, 10);
    const strategyIds = watchStrategyScopeId
      ? [watchStrategyScopeId]
      : appliedStrategies.map((s) => s.id);
    const tickers = portfolio.holdings
      .filter((h) => h.shares > 0)
      .map((h) => h.ticker.toUpperCase());

    void Promise.all([
      fetchPortfolioSnapshots({
        portfolioId: portfolio.id,
        strategyId: watchStrategyScopeId,
        from: fromStr,
      }),
      // Per-strategy marks: All-strategies conviction spark + adherence proxies.
      Promise.all(
        (watchStrategyScopeId
          ? appliedStrategies.filter((s) => s.id === watchStrategyScopeId)
          : appliedStrategies
        ).map((strategy) =>
          fetchPortfolioSnapshots({
            portfolioId: portfolio.id,
            strategyId: strategy.id,
            from: fromStr,
          }),
        ),
      ).then((rows) => rows.flat()),
      strategyIds.length > 0 && tickers.length > 0
        ? fetchConvictionSnapshots({
            strategyIds,
            tickers,
            from: fromStr,
          })
        : Promise.resolve([]),
      fetchForgeCheckEvents({
        portfolioId: portfolio.id,
        strategyIds: watchStrategyScopeId
          ? [watchStrategyScopeId]
          : strategyIds,
        fromIso: timeframeBounds.fromIso,
        toIso: timeframeBounds.toIso,
      }),
    ]).then(([bookRows, scopedBookRows, tickerRows, events]) => {
      if (cancelled) return;
      setPnlSparkPoints(seriesToSparkPoints(bookRows));
      // Conviction: scoped strategy rows (or merged across strategies for All).
      // Never rely only on whole-book '' rows — those often lack conviction.
      setConvictionSparkPoints(
        watchStrategyScopeId
          ? // Never fall back to whole-book `strategy_id ''` — those rows usually
            // omit metrics.conviction and would seed a single "Pending Check" day.
            seriesToConvictionSparkPoints(scopedBookRows)
          : mergeConvictionSparkByDay(scopedBookRows),
      );
      setSparkLoaded(true);

      const adherenceBooks =
        scopedBookRows.length > 0 ? scopedBookRows : bookRows;
      const bookCheckDays: Array<{
        strategyId: string;
        asOf: string;
        conviction: number;
      }> = [];
      for (const row of adherenceBooks) {
        const raw = row.metrics?.conviction;
        const conviction = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(conviction) || conviction === 0) continue;
        if (!row.strategyId) continue;
        bookCheckDays.push({
          strategyId: row.strategyId,
          asOf: row.asOf,
          conviction,
        });
      }
      setCheckEvents(
        mergeCheckEventsWithProxies({
          events,
          portfolioId: portfolio.id,
          snapshotRows: tickerRows.map((row) => ({
            strategyId: row.strategyId,
            ticker: row.ticker,
            asOf: row.asOf,
            conviction: row.conviction,
            status: row.status,
          })),
          bookCheckDays,
          tickers,
          ledger: shareFills,
        }),
      );
      const marks: TickerPriceMark[] = [];
      for (const row of tickerRows) {
        const lastPrice =
          typeof row.payload.lastPrice === "number"
            ? row.payload.lastPrice
            : Number(row.payload.lastPrice);
        if (Number.isFinite(lastPrice) && lastPrice > 0) {
          marks.push({
            ticker: row.ticker,
            asOf: row.asOf,
            lastPrice,
          });
        }
      }
      setPriceMarks(marks);
      setAdherenceLoaded(true);

      const liveConviction = alignment.portfolio.conviction;
      const bookSeries = portfolioConvictionSeries(bookRows);
      const byKey = new Map<string, TickerConvictionMark>();
      for (const row of tickerRows) {
        const key = `${row.asOf}:${row.ticker}`;
        const marketValue =
          typeof row.payload.marketValue === "number"
            ? row.payload.marketValue
            : undefined;
        const existing = byKey.get(key);
        if (!existing || row.conviction > existing.conviction) {
          byKey.set(key, {
            ticker: row.ticker,
            asOf: row.asOf,
            conviction: row.conviction,
            marketValue,
          });
        }
      }
      setConvictionView(
        buildConvictionChangeView(
          liveConviction,
          bookSeries,
          Array.from(byKey.values()),
          alignment,
          etIsoDate(),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    portfolio,
    watchStrategyScopeId,
    appliedStrategies,
    alignment,
    timeframeBounds.fromIso,
    timeframeBounds.toIso,
    shareFills,
  ]);

  if (!portfolio || !metrics || !alignment) {
    return (
      <section className="helm-metrics" aria-labelledby="helm-metrics-title">
        <div className="forge-section-head">
          <h3 id="helm-metrics-title" className="forge-section-title">
            Progress
          </h3>
        </div>
        <p className="helm-metrics-empty">
          Apply a strategy to a portfolio to track your progress here.
        </p>
      </section>
    );
  }

  const pnlUp = metrics.openPnlPct >= 0;
  const pnlLineColor = resolveCssColor(
    pnlUp ? "--positive" : "--negative",
    pnlUp ? "#3d9a6a" : "#c45c4a",
  );

  // Spark history ends on Last Conviction Check's ET day — never invent "today"
  // ahead of the toast (Open P&L and Total Conviction share this bound).
  const historyEndDay = lastCheckSeedTime(
    lastDataPullAtByStrategyId,
    watchStrategyScopeId,
    appliedStrategies.map((s) => s.id),
  );

  const pnlDisplayPoints = displaySparkPointsForRange(
    clipSparkPointsThrough(pnlSparkPoints, historyEndDay),
    sparkRange,
    {
      loaded: sparkLoaded,
      seedValue: metrics.openPnlPct,
      seedTime: historyEndDay,
    },
  );
  const showPnlSpark = pnlDisplayPoints.length >= 1;
  const drawPnlLine = pnlDisplayPoints.length >= 2;
  const pnlAxis = sparkAxisLabels(pnlDisplayPoints);

  const convictionDisplayPoints = displaySparkPointsForRange(
    clipSparkPointsThrough(convictionSparkPoints, historyEndDay),
    sparkRange,
    {
      loaded: sparkLoaded,
      seedValue: metrics.conviction,
      seedTime: historyEndDay,
    },
  );
  const showConvictionSpark = convictionDisplayPoints.length >= 1;
  const drawConvictionLine = convictionDisplayPoints.length >= 2;
  const convictionAxis = sparkAxisLabels(convictionDisplayPoints);
  const convictionDelta =
    drawConvictionLine &&
    convictionDisplayPoints[0] &&
    convictionDisplayPoints[convictionDisplayPoints.length - 1]
      ? convictionDisplayPoints[convictionDisplayPoints.length - 1]!.value -
        convictionDisplayPoints[0]!.value
      : 0;
  const convictionLineColor = resolveCssColor(
    drawConvictionLine
      ? convictionDelta >= 0
        ? "--positive"
        : "--negative"
      : "--positive",
    drawConvictionLine
      ? convictionDelta >= 0
        ? "#3d9a6a"
        : "#c45c4a"
      : "#3d9a6a",
  );

  const todayDelta = convictionView?.change.todayDelta ?? null;
  const sessions5Delta = convictionView?.change.sessions5Delta ?? null;
  const showConvictionChange =
    todayDelta != null || sessions5Delta != null;

  const adherenceStrategyIds = watchStrategyScopeId
    ? [watchStrategyScopeId]
    : null;
  const notificationCount = adherenceLoaded
    ? countNotifications(
        checkEvents,
        portfolio.id,
        adherenceStrategyIds,
        timeframeBounds,
      )
    : null;
  const actionCounts = adherenceLoaded
    ? countActions(
        shareFills,
        checkEvents,
        portfolio.id,
        adherenceStrategyIds,
        timeframeBounds,
      )
    : null;
  const zoneImpact = adherenceLoaded
    ? computeZoneFollowedImpact(
        shareFills,
        priceMarks,
        portfolio.id,
        adherenceStrategyIds,
        timeframeBounds,
        undefined,
        checkEvents,
      )
    : null;

  // Portfolio resolved status can still reflect pending/fake alignment. Only
  // show compass / Plan Alignment overall chip when that primary tone appears
  // among cadence-ready Plan Alignment counts.
  const primaryTone = STATUS_TONE[alignment.portfolio.resolved.primary];
  const showPlanAlignmentOverall = metrics.statusMix.some(
    (slice) => slice.tone === primaryTone,
  );
  // Count chips priority: On Plan → Review → Off Plan; Watch last when present.
  const planCountTones: SignalTone[] = [
    "positive",
    "warning",
    "negative",
    "neutral",
  ];
  const planCountSlices = planCountTones
    .map((tone) => metrics.statusMix.find((slice) => slice.tone === tone))
    .filter((slice): slice is (typeof metrics.statusMix)[number] =>
      Boolean(slice),
    );

  return (
    <section className="helm-metrics" aria-labelledby="helm-metrics-title">
      <div className="forge-section-head">
        <h3 id="helm-metrics-title" className="forge-section-title">
          Progress
        </h3>
        <span className="helm-metrics-scope">
          <span className="chip">{portfolio.label}</span>
          <StrategyScopeSelect
            strategies={appliedStrategies}
            value={watchStrategyScopeId}
            onChange={setWatchStrategyScopeId}
          />
        </span>
      </div>

      <div className="helm-metrics-grid">
        <div className="select-card helm-metric helm-metric--conviction">
          <div className="helm-metric-head">
            <span className="helm-metric-label">Total Conviction</span>
            <span className="panel-tag session-tag">{sparkRangeLabel}</span>
          </div>
          <div className="helm-conviction-top">
            <div className="helm-conviction-score-row">
              {showPlanAlignmentOverall ? (
                <PortfolioCompass
                  status={alignment.portfolio.resolved.primary}
                />
              ) : null}
              <span className="helm-metric-value">
                {formatDecimals(metrics.conviction)}
                <span className="helm-metric-unit">/100</span>
              </span>
            </div>
            <div className="helm-conviction-copy">
              {showConvictionChange ? (
                <span className="helm-conviction-change">
                  {todayDelta != null ? (
                    <span
                      className={
                        todayDelta > 0
                          ? "helm-metric-value--up"
                          : todayDelta < 0
                            ? "helm-metric-value--down"
                            : undefined
                      }
                    >
                      {formatConvictionDelta(todayDelta)} today
                    </span>
                  ) : null}
                  {todayDelta != null && sessions5Delta != null ? (
                    <span className="helm-conviction-change-sep" aria-hidden>
                      {" · "}
                    </span>
                  ) : null}
                  {sessions5Delta != null ? (
                    <span
                      className={
                        sessions5Delta > 0
                          ? "helm-metric-value--up"
                          : sessions5Delta < 0
                            ? "helm-metric-value--down"
                            : undefined
                      }
                    >
                      {formatConvictionDelta(sessions5Delta)} over 5 sessions
                    </span>
                  ) : null}
                </span>
              ) : null}
              {convictionView?.driverSummary ? (
                <span className="helm-conviction-drivers">
                  {convictionView.driverSummary}
                </span>
              ) : null}
            </div>
          </div>
          {showConvictionSpark ? (
            <>
              <Suspense fallback={null}>
                <SparklineChart
                  points={convictionDisplayPoints}
                  lineColor={convictionLineColor}
                  height={48}
                  className="helm-metric-spark"
                  showPointMarkers={showPointMarkers}
                  lineVisible={drawConvictionLine}
                  formatValue={formatDecimals}
                  ariaLabel="Total Conviction history"
                />
              </Suspense>
              <span className="helm-metric-spark-dates">
                <span>{convictionAxis.start}</span>
                <span>{convictionAxis.end}</span>
              </span>
            </>
          ) : null}
          <span className="helm-metric-note">Market-value weighted</span>
        </div>

        <div className="select-card helm-metric helm-metric--pnl">
          <div className="helm-metric-head">
            <span className="helm-metric-label">Open P&amp;L</span>
            <span className="panel-tag session-tag">{sparkRangeLabel}</span>
          </div>
          <span
            className={`helm-metric-value ${
              pnlUp ? "helm-metric-value--up" : "helm-metric-value--down"
            }`}
          >
            {formatChange(metrics.openPnlPct)}
          </span>
          {showPnlSpark ? (
            <div className="helm-metric-spark-block">
              <Suspense fallback={null}>
                <SparklineChart
                  points={pnlDisplayPoints}
                  lineColor={pnlLineColor}
                  height={48}
                  className="helm-metric-spark"
                  showPointMarkers={showPointMarkers}
                  lineVisible={drawPnlLine}
                  formatValue={formatChange}
                  ariaLabel="Open P&L history"
                />
              </Suspense>
              <span className="helm-metric-spark-dates">
                <span>{pnlAxis.start}</span>
                <span>{pnlAxis.end}</span>
              </span>
            </div>
          ) : (
            <span className="helm-metric-note">A by-product of discipline</span>
          )}
        </div>

        <div className="select-card helm-metric helm-metric--alignment">
          <span className="helm-metric-label">Plan Alignment</span>
          <div className="helm-metric-body">
            {showPlanAlignmentOverall ||
            planCountSlices.length > 0 ||
            metrics.pendingScoreCount > 0 ? (
              <div className="helm-metric-chips helm-metric-chips--stack">
                {showPlanAlignmentOverall ? (
                  <StatusStack resolved={alignment.portfolio.resolved} />
                ) : null}
                {planCountSlices.map((slice) => (
                  <span
                    key={slice.tone}
                    className={`chip status--${slice.tone}`}
                  >
                    {TONE_LABEL[slice.tone]} | {slice.count}
                  </span>
                ))}
                {metrics.pendingScoreCount > 0 ? (
                  <span className="chip status--neutral">
                    Pending Score | {metrics.pendingScoreCount}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="helm-metric-note">No scored holdings yet</span>
            )}
          </div>
        </div>
      </div>

      <div className="forge-section-head">
        <h3 id="helm-composition-title" className="forge-section-title">
          Composition
        </h3>
      </div>
      <div
        className="helm-metrics-grid"
        aria-labelledby="helm-composition-title"
      >
        <div className="select-card helm-metric helm-metric--text">
          <span className="helm-metric-label">Strategy Coverage</span>
          <div className="helm-metric-body">
            <span className="helm-metric-value">
              {metrics.scoredCount}
              <span className="helm-metric-unit">/{metrics.holdingCount}</span>
            </span>
            <span className="helm-metric-note">
              {metrics.coveragePct}% of holdings
            </span>
          </div>
        </div>
        {metrics.composition.map((slice) => (
          <div
            key={slice.label}
            className="select-card helm-metric helm-metric--text"
          >
            <span className="helm-metric-label">{slice.label}</span>
            <div className="helm-metric-body">
              <span className="helm-metric-value">
                {slice.count}
                <span className="helm-metric-unit">/{slice.count}</span>
              </span>
              <span className="helm-metric-note">
                100% of position holdings
              </span>
            </div>
          </div>
        ))}
      </div>
      {metrics.composition.length === 0 ? (
        <p className="helm-metrics-empty">No scored holdings yet</p>
      ) : null}

      <div className="forge-section-head">
        <h3 id="helm-adherence-title" className="forge-section-title">
          Plan Adherence
        </h3>
      </div>
      <div
        className="helm-metrics-grid"
        aria-labelledby="helm-adherence-title"
      >
        <div className="select-card helm-metric helm-metric--text">
          <div className="helm-metric-head">
            <span className="helm-metric-label">Notifications</span>
            <span className="panel-tag session-tag">{sparkRangeLabel}</span>
          </div>
          <div className="helm-metric-body">
            <span className="helm-metric-value">
              {notificationCount == null ? "—" : notificationCount}
            </span>
            <span className="helm-metric-note">
              {notificationCount === 0
                ? "No checks in range yet"
                : "Status + zone flags by check"}
            </span>
          </div>
        </div>

        <div className="select-card helm-metric helm-metric--text">
          <div className="helm-metric-head">
            <span className="helm-metric-label">Total Actions</span>
            <span className="panel-tag session-tag">{sparkRangeLabel}</span>
          </div>
          <div className="helm-metric-body">
            <span className="helm-metric-value">
              {actionCounts == null ? "—" : actionCounts.total}
            </span>
            <span className="helm-metric-note">
              {actionCounts == null
                ? "Loading…"
                : actionCounts.total === 0
                  ? "No buys, sells, cash, or holds yet"
                  : `Buy ${actionCounts.buy} · Sell ${actionCounts.sell} · Hold ${actionCounts.hold}`}
            </span>
          </div>
        </div>

        <div className="select-card helm-metric helm-metric--text">
          <div className="helm-metric-head">
            <span className="helm-metric-label">Zone-Followed Impact</span>
            <span className="panel-tag session-tag">{sparkRangeLabel}</span>
          </div>
          <div className="helm-metric-body">
            <span
              className={`helm-metric-value${
                zoneImpact?.avgReturnPct != null
                  ? zoneImpact.avgReturnPct >= 0
                    ? " helm-metric-value--up"
                    : " helm-metric-value--down"
                  : ""
              }`}
            >
              {zoneImpact?.avgReturnPct == null
                ? "—"
                : formatChange(zoneImpact.avgReturnPct)}
            </span>
            <span className="helm-metric-note">
              {zoneImpact == null
                ? "Loading…"
                : zoneImpact.matchedFills > 0
                  ? `Trim/Add follows · ${zoneImpact.horizonSessions} sessions · ${zoneImpact.matchedFills} fills`
                  : zoneImpact.consideredFills > 0
                    ? `0 of ${zoneImpact.consideredFills} actions matched a zone`
                    : "No zone-followed actions yet"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
