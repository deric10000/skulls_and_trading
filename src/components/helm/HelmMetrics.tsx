import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  useAuthState,
  useMarketState,
  useWorkspaceState,
} from "../../state/AppState";
import { dataSource } from "../../lib/datasource";
import { getPortfolioAlignmentCached } from "../../lib/forge/alignmentCache";
import {
  buildConvictionChangeView,
  formatConvictionDelta,
  portfolioConvictionSeries,
  type ConvictionChangeView,
  type TickerConvictionMark,
} from "../../lib/forge/convictionChange";
import { computeHelmMetrics } from "../../lib/forge/helmMetrics";
import {
  isUntrackedHolding,
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
  pnlDeltaPct,
  seriesToConvictionSparkPoints,
  seriesToSparkPoints,
  sparkRangeShowsPointMarkers,
  type HelmTimeframe,
  type SparkPoint,
} from "../../lib/finance/portfolioSnapshotSeries";
import { portfolioRunningTotals } from "../../lib/finance/portfolioTotals";
import { getLiveQuote } from "../../lib/market/liveCache";
import {
  countActions,
  computeAverageHoldTime,
  computeZoneFollowedImpact,
  mergeCheckEventsWithProxies,
  summarizeNotificationCampaigns,
  type ForgeCheckEvent,
  type TickerPriceMark,
} from "../../lib/forge/planAdherence";
import { fetchProgressHistory } from "../../lib/helm/progressHistory";
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

function pnlSparkLineColor(points: SparkPoint[]): string {
  const delta = pnlDeltaPct(points);
  const up = (delta ?? 0) >= 0;
  return resolveCssColor(
    up ? "--positive" : "--negative",
    up ? "#3d9a6a" : "#c45c4a",
  );
}

/**
 * The Helm — derived progress metrics for the portfolio selected in Current
 * Watch (mirrored via shared AppState). Strategy scope is shared Home state
 * (`watchStrategyScopeId`) so Progress and Current Watch filter together.
 * Open P&L and Total Conviction history load from portfolio_snapshots
 * (additive; scoring unchanged). All Strategies Open P&L headline = window
 * delta (matches spark colors); live whole-book % stays computed for the
 * upcoming timeframe switch. Single-strategy scope keeps all-time snapshot
 * delta as the headline. Shared spark range defaults to 1 week (toggle UI later).
 */
export function HelmMetrics() {
  const {
    portfolios,
    strategies,
    buckets,
    selectedPortfolioId,
    watchStrategyScopeId,
    setWatchStrategyScopeId,
    shareFills,
  } = useWorkspaceState();
  const {
    getPortfolioAlignment,
    isConvictionScoreReady,
    lastDataPullAtByStrategyId,
  } = useMarketState();
  const { userProfile } = useAuthState();

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
  const trackedTickerSet = useMemo(() => {
    if (!portfolio) return new Set<string>();
    return new Set(
      portfolio.holdings
        .filter(
          (holding) =>
            !isUntrackedHolding(holding, portfolio.id, strategies),
        )
        .map((holding) => holding.ticker.toUpperCase()),
    );
  }, [portfolio, strategies]);

  const [pnlSparkPoints, setPnlSparkPoints] = useState<SparkPoint[]>([]);
  /** Per-strategy Open P&L series for All Strategies stacked sparks. */
  const [pnlStrategySeries, setPnlStrategySeries] = useState<
    Array<{ strategyId: string; points: SparkPoint[] }>
  >([]);
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
      ? getPortfolioAlignmentCached(portfolio, buckets, [focusedStrategy], {
          caller: "helm",
        })
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
      isTracked: (ticker) => trackedTickerSet.has(ticker.toUpperCase()),
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
    trackedTickerSet,
    isConvictionScoreReady,
    lastDataPullAtByStrategyId,
  ]);

  useEffect(() => {
    if (!portfolio || !alignment || !userProfile?.id) {
      setPnlSparkPoints([]);
      setPnlStrategySeries([]);
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

    // Conviction / ticker / adherence stay near-term; Open P&L needs full
    // history for the all-time headline delta (omit `from`).
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 21);
    const fromStr = from.toISOString().slice(0, 10);
    const tickers = portfolio.holdings
      .filter(
        (h) => h.shares > 0 && trackedTickerSet.has(h.ticker.toUpperCase()),
      )
      .map((h) => h.ticker.toUpperCase());

    const eventsFromIso =
      fromStr < timeframeBounds.fromDate
        ? `${fromStr}T00:00:00.000Z`
        : timeframeBounds.fromIso;

    void fetchProgressHistory({
      userId: userProfile.id,
      portfolioId: portfolio.id,
      strategyId: watchStrategyScopeId,
      appliedStrategyIds: appliedStrategies.map((strategy) => strategy.id),
      tickers,
      recentFrom: fromStr,
      // Look back beyond the Helm tag so ongoing notification campaigns are
      // not miscounted as new launches at the window edge.
      eventsFromIso,
      eventsToIso: timeframeBounds.toIso,
    }).then(({ bookRows, scopedBookRows, tickerRows, events }) => {
      if (cancelled) return;
      setPnlSparkPoints(seriesToSparkPoints(bookRows));
      if (watchStrategyScopeId) {
        setPnlStrategySeries([]);
      } else {
        const byStrategy = new Map<string, typeof scopedBookRows>();
        for (const row of scopedBookRows) {
          if (!row.strategyId) continue;
          const list = byStrategy.get(row.strategyId) ?? [];
          list.push(row);
          byStrategy.set(row.strategyId, list);
        }
        setPnlStrategySeries(
          appliedStrategies.map((strategy) => ({
            strategyId: strategy.id,
            points: seriesToSparkPoints(byStrategy.get(strategy.id) ?? []),
          })),
        );
      }
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
        }).filter((event) =>
          trackedTickerSet.has(event.ticker.toUpperCase()),
        ),
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
    trackedTickerSet,
    timeframeBounds.fromIso,
    timeframeBounds.toIso,
    shareFills,
    userProfile?.id,
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

  // Spark history ends on Last Conviction Check's ET day — never invent "today"
  // ahead of the toast (Open P&L and Total Conviction share this bound).
  const historyEndDay = lastCheckSeedTime(
    lastDataPullAtByStrategyId,
    watchStrategyScopeId,
    appliedStrategies.map((s) => s.id),
  );

  const pnlHistoryPoints = clipSparkPointsThrough(
    pnlSparkPoints,
    historyEndDay,
  );
  const latestSnapshotPnlPct =
    pnlHistoryPoints.length > 0
      ? pnlHistoryPoints[pnlHistoryPoints.length - 1]!.value
      : null;

  const pnlDisplayPoints = displaySparkPointsForRange(
    pnlHistoryPoints,
    sparkRange,
    {
      loaded: sparkLoaded,
      // Seed from latest snapshot level only — never live open-book %.
      seedValue: latestSnapshotPnlPct,
      seedTime: historyEndDay,
    },
  );
  const allTimePnlPct = pnlDeltaPct(pnlHistoryPoints);
  const rangePnlPct = pnlDeltaPct(pnlDisplayPoints);
  // Reserved for upcoming Helm timeframe switch (live level / 1m / 1y / YTD).
  // Not shown on All Strategies today — headline uses the window delta so it
  // matches the spark colors. Keep computing so Current Watch parity stays ready.
  const liveBookOpenPnlPct = portfolioRunningTotals(
    portfolio.holdings.map((holding) => {
      const quote = getLiveQuote(holding.ticker);
      const lastPrice =
        quote && Number.isFinite(quote.lastPrice) && quote.lastPrice > 0
          ? quote.lastPrice
          : 0;
      return {
        price: lastPrice,
        shares: holding.shares,
        avgPrice: holding.avgPrice,
      };
    }),
    portfolio.cashAvailable ?? 0,
  ).openPnlPct;
  void liveBookOpenPnlPct;
  // All Strategies: window delta (same story as the sparks). Single strategy:
  // all-time snapshot delta. Tag under “1 WEEK” only when it differs (scoped).
  const headlinePnlPct = focusedStrategy ? allTimePnlPct : rangePnlPct;
  const showRangePnlUnderTag = Boolean(focusedStrategy) && rangePnlPct != null;
  const pnlLineColor = pnlSparkLineColor(pnlDisplayPoints);
  const showPnlSpark = pnlDisplayPoints.length >= 1;
  const drawPnlLine = pnlDisplayPoints.length >= 2;
  const pnlAxis = sparkAxisLabels(pnlDisplayPoints);
  const showStackedPnlSparks = !focusedStrategy && appliedStrategies.length > 0;
  const stackedPnlLanes = showStackedPnlSparks
    ? [
        {
          key: "all",
          label: "All Strategies",
          history: pnlHistoryPoints,
        },
        ...pnlStrategySeries.map((series) => ({
          key: series.strategyId,
          label:
            appliedStrategies.find((strategy) => strategy.id === series.strategyId)
              ?.name ?? series.strategyId,
          history: series.points,
        })),
      ].map((lane) => {
        const clipped = clipSparkPointsThrough(lane.history, historyEndDay);
        const latest =
          clipped.length > 0 ? clipped[clipped.length - 1]!.value : null;
        const display = displaySparkPointsForRange(clipped, sparkRange, {
          loaded: sparkLoaded,
          seedValue: latest,
          seedTime: historyEndDay,
        });
        return {
          key: lane.key,
          label: lane.label,
          display,
          drawLine: display.length >= 2,
          lineColor: pnlSparkLineColor(display),
        };
      })
    : [];
  const showPnlSparkBlock =
    showStackedPnlSparks
      ? stackedPnlLanes.some((lane) => lane.display.length >= 1)
      : showPnlSpark;

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
  // Neutral blue — conviction level isn't a P&L win/loss signal.
  const convictionLineColor = resolveCssColor("--info", "#56b6f0");

  const todayDelta = convictionView?.change.todayDelta ?? null;
  const sessions5Delta = convictionView?.change.sessions5Delta ?? null;
  const showConvictionChange =
    todayDelta != null || sessions5Delta != null;

  const adherenceStrategyIds = watchStrategyScopeId
    ? [watchStrategyScopeId]
    : null;
  const notificationSummary = adherenceLoaded
    ? summarizeNotificationCampaigns(
        checkEvents,
        portfolio.id,
        adherenceStrategyIds,
        timeframeBounds,
      )
    : null;
  const actionCounts = adherenceLoaded
    ? countActions(
        shareFills.filter(
          (transaction) =>
            transaction.kind === "cash" ||
            trackedTickerSet.has(transaction.ticker.toUpperCase()),
        ),
        checkEvents,
        portfolio.id,
        adherenceStrategyIds,
        timeframeBounds,
      )
    : null;
  const averageHoldTime = useMemo(() => {
    if (!portfolio) return null;
    const tickersInScope = portfolio.holdings
      .filter((holding) => {
        if (!trackedTickerSet.has(holding.ticker.toUpperCase())) return false;
        if (!focusedStrategy) return true;
        return shouldScoreTickerWithStrategy(
          holding,
          focusedStrategy,
          portfolio.id,
        );
      })
      .map((holding) => holding.ticker.toUpperCase());
    // Include tickers that only appear in the ledger for closed episodes.
    for (const tx of shareFills) {
      if (tx.kind !== "qty" || tx.portfolioId !== portfolio.id) continue;
      const symbol = tx.ticker.toUpperCase();
      if (trackedTickerSet.size > 0 && !trackedTickerSet.has(symbol)) continue;
      if (!tickersInScope.includes(symbol)) tickersInScope.push(symbol);
    }
    const currentSharesByTicker: Record<string, number> = {};
    for (const holding of portfolio.holdings) {
      currentSharesByTicker[holding.ticker.toUpperCase()] = holding.shares;
    }
    return computeAverageHoldTime({
      ledger: shareFills,
      portfolioId: portfolio.id,
      currentSharesByTicker,
      strategyIds: adherenceStrategyIds,
      tickersInScope,
      asOfDate: etIsoDate(),
    });
  }, [
    portfolio,
    shareFills,
    trackedTickerSet,
    focusedStrategy,
    adherenceStrategyIds,
  ]);
  const zoneImpact = adherenceLoaded
    ? computeZoneFollowedImpact(
        shareFills.filter(
          (transaction) =>
            transaction.kind === "cash" ||
            trackedTickerSet.has(transaction.ticker.toUpperCase()),
        ),
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
  const stocksInAlignment = planCountSlices.reduce(
    (sum, slice) => sum + slice.count,
    0,
  );
  // Composition share always uses the whole-book denominator so a single-strategy
  // scope keeps the same N/8 · % as All Strategies (not N/N).
  const portfolioHoldingCount = portfolio.holdings.filter(
    (holding) => holding.shares > 0,
  ).length;

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

        <div
          className={`select-card helm-metric helm-metric--pnl${
            showStackedPnlSparks ? " helm-metric--pnl-stacked" : ""
          }`}
        >
          <div className="helm-metric-head">
            <span className="helm-metric-label">Open P&amp;L</span>
            <span className="helm-metric-tag-stack">
              <span className="panel-tag session-tag">{sparkRangeLabel}</span>
              {showRangePnlUnderTag ? (
                <span
                  className={`helm-metric-range-pnl ${
                    rangePnlPct! >= 0
                      ? "helm-metric-value--up"
                      : "helm-metric-value--down"
                  }`}
                >
                  {formatChange(rangePnlPct!)}
                </span>
              ) : null}
            </span>
          </div>
          <span
            className={`helm-metric-value ${
              headlinePnlPct == null
                ? ""
                : headlinePnlPct >= 0
                  ? "helm-metric-value--up"
                  : "helm-metric-value--down"
            }`}
          >
            {headlinePnlPct != null ? formatChange(headlinePnlPct) : "—"}
          </span>
          {showPnlSparkBlock ? (
            showStackedPnlSparks ? (
              <div className="helm-metric-spark-stack">
                {stackedPnlLanes.map((lane) =>
                  lane.display.length >= 1 ? (
                    <div key={lane.key} className="helm-metric-spark-lane">
                      <Suspense fallback={null}>
                        <SparklineChart
                          points={lane.display}
                          lineColor={lane.lineColor}
                          height={28}
                          className="helm-metric-spark"
                          showPointMarkers={showPointMarkers}
                          lineVisible={lane.drawLine}
                          formatValue={formatChange}
                          ariaLabel={`${lane.label} Open P&L history`}
                        />
                      </Suspense>
                      <span className="helm-metric-note" title={lane.label}>
                        {lane.label}
                      </span>
                    </div>
                  ) : null,
                )}
                <span className="helm-metric-spark-dates">
                  <span>{pnlAxis.start}</span>
                  <span>{pnlAxis.end}</span>
                </span>
              </div>
            ) : (
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
            )
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
            {stocksInAlignment > 0 ? (
              <span className="helm-metric-note helm-metric-note--split">
                <span className="helm-metric-note-stat">
                  {stocksInAlignment}
                </span>{" "}
                Total Stocks in Alignment
              </span>
            ) : null}
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
        {!focusedStrategy ? (
          <div className="select-card helm-metric helm-metric--text">
            <div className="helm-metric-head">
              <span className="helm-metric-label">Strategy Coverage</span>
            </div>
            <div className="helm-metric-body">
              <span className="helm-metric-value">
                {metrics.scoredCount}
                <span className="helm-metric-unit">
                  /{metrics.holdingCount}
                </span>
              </span>
              <span className="helm-metric-note">
                {metrics.coveragePct}% of holdings
              </span>
            </div>
          </div>
        ) : null}
        {metrics.composition.map((slice) => {
          const denom = portfolioHoldingCount;
          const sharePct =
            denom > 0 ? Math.round((slice.count / denom) * 100) : 0;
          return (
            <div
              key={slice.label}
              className="select-card helm-metric helm-metric--text"
            >
              <div className="helm-metric-head">
                <span className="helm-metric-label">{slice.label}</span>
              </div>
              <div className="helm-metric-body">
                <span className="helm-metric-value">
                  {slice.count}
                  <span className="helm-metric-unit">/{denom}</span>
                </span>
                <span className="helm-metric-note">
                  {sharePct}% of holdings
                </span>
              </div>
            </div>
          );
        })}
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
            <span className="helm-metric-label">Average Hold Time</span>
            <span className="panel-tag session-tag">All time</span>
          </div>
          <div className="helm-metric-body">
            <span className="helm-metric-value">
              {averageHoldTime?.avgDays == null
                ? "—"
                : `${Math.round(averageHoldTime.avgDays)}d`}
            </span>
            <span className="helm-metric-note">
              {averageHoldTime?.avgDays == null || !averageHoldTime.sinceDate
                ? "No hold history yet"
                : `Avg. hold time of stocks since ${formatSparkDate(averageHoldTime.sinceDate)}`}
            </span>
          </div>
        </div>

        <div className="select-card helm-metric helm-metric--text">
          <div className="helm-metric-head">
            <span className="helm-metric-label">Notifications</span>
            <span className="panel-tag session-tag">{sparkRangeLabel}</span>
          </div>
          <div className="helm-metric-body">
            <span className="helm-metric-value">
              {notificationSummary == null
                ? "—"
                : notificationSummary.episodes}
            </span>
            <span className="helm-metric-note">
              {notificationSummary == null
                ? "Loading…"
                : notificationSummary.episodes === 0
                  ? "No strategy conviction notifications"
                  : "strategy conviction notifications"}
            </span>
            {notificationSummary != null &&
            notificationSummary.episodes > 0 ? (
              <span className="helm-metric-note helm-metric-note--split">
                <span className="helm-metric-note-stat">
                  {notificationSummary.newLaunches}
                </span>{" "}
                new ·{" "}
                <span className="helm-metric-note-stat">
                  {notificationSummary.distinct}
                </span>{" "}
                need attention
              </span>
            ) : null}
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
                  ? "No buys or sells yet"
                  : `Buy ${actionCounts.buy} · Sell ${actionCounts.sell}`}
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
