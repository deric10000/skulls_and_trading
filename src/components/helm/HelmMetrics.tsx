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
import { seriesToSparkPoints } from "../../lib/finance/portfolioSnapshotSeries";
import {
  fetchConvictionSnapshots,
  fetchPortfolioSnapshots,
} from "../../lib/userStore";
import { formatChange, formatDecimals } from "../../lib/format";
import { STATUS_TONE } from "../../lib/status";
import type { SignalTone } from "../../types";
import { PortfolioCompass } from "../PortfolioCompass";
import { StatusStack } from "../StatusBadge";
import { StrategyScopeSelect } from "../StrategyScopeSelect";

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
 * Open P&L history loads from portfolio_snapshots (additive; scoring unchanged).
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

  const [sparkPoints, setSparkPoints] = useState<
    ReturnType<typeof seriesToSparkPoints>
  >([]);
  const [sparkLoaded, setSparkLoaded] = useState(false);
  const [convictionView, setConvictionView] =
    useState<ConvictionChangeView | null>(null);

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
      setSparkPoints([]);
      setSparkLoaded(false);
      setConvictionView(null);
      return;
    }
    let cancelled = false;
    setSparkLoaded(false);

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
      strategyIds.length > 0 && tickers.length > 0
        ? fetchConvictionSnapshots({
            strategyIds,
            tickers,
            from: fromStr,
          })
        : Promise.resolve([]),
    ]).then(([bookRows, tickerRows]) => {
      if (cancelled) return;
      setSparkPoints(seriesToSparkPoints(bookRows));
      setSparkLoaded(true);

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
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [portfolio, watchStrategyScopeId, appliedStrategies, alignment]);

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
  const lineColor = resolveCssColor(
    pnlUp ? "--positive" : "--negative",
    pnlUp ? "#3d9a6a" : "#c45c4a",
  );
  const showSpark = sparkLoaded && sparkPoints.length >= 2;
  const startDate = sparkPoints[0]?.time;
  const endDate = sparkPoints[sparkPoints.length - 1]?.time;
  const todayDelta = convictionView?.change.todayDelta ?? null;
  const sessions5Delta = convictionView?.change.sessions5Delta ?? null;
  const showConvictionChange =
    todayDelta != null || sessions5Delta != null;

  // Portfolio resolved status can still reflect pending/fake alignment. Only
  // show StatusStack / compass when that primary tone appears among
  // cadence-ready Plan Alignment counts (e.g. hide Review when nothing is
  // actually due for review after the last check).
  const primaryTone = STATUS_TONE[alignment.portfolio.resolved.primary];
  const showConvictionStatus = metrics.statusMix.some(
    (slice) => slice.tone === primaryTone,
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
          <div className="helm-conviction-top">
            <div className="helm-conviction-copy">
              <span className="helm-metric-label">Total Conviction</span>
              <span className="helm-metric-value">
                {formatDecimals(metrics.conviction)}
                <span className="helm-metric-unit">/100</span>
              </span>
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
            {showConvictionStatus ? (
              <PortfolioCompass status={alignment.portfolio.resolved.primary} />
            ) : null}
          </div>
          {showConvictionStatus ? (
            <StatusStack resolved={alignment.portfolio.resolved} />
          ) : null}
          <span className="helm-metric-note">Market-value weighted</span>
        </div>

        <div className="select-card helm-metric">
          <span className="helm-metric-label">Strategy Coverage</span>
          <span className="helm-metric-value">
            {metrics.scoredCount}
            <span className="helm-metric-unit">/{metrics.holdingCount}</span>
          </span>
          <span className="helm-metric-note">{metrics.coveragePct}% of holdings</span>
        </div>

        <div className="select-card helm-metric helm-metric--pnl">
          <span className="helm-metric-label">Open P&amp;L</span>
          <span
            className={`helm-metric-value ${
              pnlUp ? "helm-metric-value--up" : "helm-metric-value--down"
            }`}
          >
            {formatChange(metrics.openPnlPct)}
          </span>
          {showSpark ? (
            <>
              <Suspense fallback={null}>
                <SparklineChart
                  points={sparkPoints}
                  lineColor={lineColor}
                  height={48}
                  className="helm-pnl-spark"
                />
              </Suspense>
              <span className="helm-pnl-dates">
                <span>{startDate ? formatSparkDate(startDate) : ""}</span>
                <span>{endDate ? formatSparkDate(endDate) : ""}</span>
              </span>
            </>
          ) : (
            <span className="helm-metric-note">
              {sparkLoaded
                ? "History starts after the next market refresh"
                : "A by-product of discipline"}
            </span>
          )}
        </div>

        <div className="select-card helm-metric helm-metric--wide">
          <span className="helm-metric-label">Plan Alignment</span>
          {metrics.statusMix.length > 0 || metrics.pendingScoreCount > 0 ? (
            <div className="helm-metric-chips">
              {metrics.pendingScoreCount > 0 ? (
                <span className="chip status--neutral">
                  Pending Score | {metrics.pendingScoreCount}
                </span>
              ) : null}
              {metrics.statusMix.map((slice) => (
                <span key={slice.tone} className={`chip status--${slice.tone}`}>
                  {TONE_LABEL[slice.tone]} | {slice.count}
                </span>
              ))}
            </div>
          ) : (
            <span className="helm-metric-note">No scored holdings yet</span>
          )}
        </div>
      </div>

      <div className="forge-section-head">
        <h3 id="helm-composition-title" className="forge-section-title">
          Composition
        </h3>
      </div>
      {metrics.composition.length > 0 ? (
        <div
          className="helm-metrics-grid"
          aria-labelledby="helm-composition-title"
        >
          {metrics.composition.map((slice) => (
            <div key={slice.label} className="select-card helm-metric">
              <span className="helm-metric-label">{slice.label}</span>
              <span className="helm-metric-value">
                {slice.count}
                <span className="helm-metric-unit">/{slice.count}</span>
              </span>
              <span className="helm-metric-note">
                100% of position holdings
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="helm-metrics-empty">No scored holdings yet</p>
      )}
    </section>
  );
}
