import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { SparkPoint } from "../../lib/finance/portfolioSnapshotSeries";
import { formatChange } from "../../lib/format";
import { useIsMobile } from "../../lib/useIsMobile";

export type SparklineChartProps = {
  points: SparkPoint[];
  /** CSS color for the line (token-resolved by caller). */
  lineColor: string;
  height?: number;
  className?: string;
  /**
   * Day/week views only — circle markers on each session point.
   * Keep false for month/year ranges when those ship.
   */
  showPointMarkers?: boolean;
  /** False for a single-point seed (dot only, no line segment). */
  lineVisible?: boolean;
  /** Tip value formatter (Open P&L `%` vs conviction score). */
  formatValue?: (value: number) => string;
  /** Accessible name for the chart surface. */
  ariaLabel?: string;
};

function formatSparkDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

type HoverTip = {
  time: string;
  dateLabel: string;
  valueLabel: string;
  left: number;
  top: number;
};

function resolveTimeLabel(
  param: MouseEventParams<Time>,
  chart: IChartApi,
): string | null {
  if (typeof param.time === "string") return param.time;
  if (!param.point) return null;
  const fromCoord = chart.timeScale().coordinateToTime(param.point.x);
  return typeof fromCoord === "string" ? fromCoord : null;
}

function nearestPoint(
  points: SparkPoint[],
  timeLabel: string | null,
): SparkPoint | null {
  if (points.length === 0) return null;
  if (!timeLabel) return points[points.length - 1] ?? null;
  const exact = points.find((point) => point.time === timeLabel);
  if (exact) return exact;
  let best = points[0]!;
  let bestDist = Math.abs(Date.parse(best.time) - Date.parse(timeLabel));
  for (const point of points.slice(1)) {
    const dist = Math.abs(Date.parse(point.time) - Date.parse(timeLabel));
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function tipFromPoint(
  point: SparkPoint,
  chartPoint: { x: number; y: number },
  hostWidth: number,
  formatValue: (value: number) => string,
): HoverTip {
  const tipWidth = 88;
  const left = Math.min(
    Math.max(chartPoint.x - tipWidth / 2, 0),
    Math.max(hostWidth - tipWidth, 0),
  );
  return {
    time: point.time,
    dateLabel: formatSparkDate(point.time),
    valueLabel: formatValue(point.value),
    left,
    top: Math.max(chartPoint.y - 34, 0),
  };
}

/**
 * Compact TradingView lightweight-charts line — no chrome, no axes labels
 * beyond what the parent renders. Lazy-load this module from Helm only.
 * Desktop: hover tip via crosshair. Mobile: tap-to-toggle tip on a session
 * point (outside tap dismisses).
 *
 * Single-point seeds skip LWC (it pins one bar to the right) and render a
 * left-aligned CSS mark next to the start date.
 */
export function SparklineChart({
  points,
  lineColor,
  height = 48,
  className,
  showPointMarkers = true,
  lineVisible = true,
  formatValue = formatChange,
  ariaLabel = "History",
}: SparklineChartProps) {
  const isMobile = useIsMobile();
  const isSinglePoint = points.length === 1;
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const formatValueRef = useRef(formatValue);
  formatValueRef.current = formatValue;
  const showPointMarkersRef = useRef(showPointMarkers);
  showPointMarkersRef.current = showPointMarkers;
  const tipRef = useRef<HoverTip | null>(null);
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
  tipRef.current = hoverTip;
  const syncSizeRef = useRef<() => void>(() => {});

  // Chart lifetime — do NOT remount when isMobile flips (tablet/phone breakpoint).
  // Destroying LWC mid-layout is what left sparks blank until a full refresh.
  useEffect(() => {
    if (isSinglePoint) return;
    const host = hostRef.current;
    const wrap = wrapRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      height,
      width: Math.max(host.clientWidth, 1),
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: false,
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
      },
      crosshair: {
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      lineVisible,
      pointMarkersVisible: showPointMarkers,
      pointMarkersRadius: 3,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: showPointMarkers,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: lineColor,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const seed = pointsRef.current;
    if (seed.length > 0) {
      series.setData(
        seed.map((point) => ({
          time: point.time as Time,
          value: point.value,
        })),
      );
    }

    let raf = 0;
    let retry = 0;
    const syncSize = () => {
      const el = hostRef.current;
      const chartApi = chartRef.current;
      if (!el || !chartApi) return;
      const width = Math.floor(el.clientWidth);
      const nextHeight = Math.floor(el.clientHeight) || height;
      if (width <= 0 || nextHeight <= 0) {
        // Home deck / grid breakpoint can report 0 for a few frames — retry.
        if (retry < 24) {
          retry += 1;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(syncSize);
        }
        return;
      }
      retry = 0;
      chartApi.resize(width, nextHeight, true);
      chartApi.timeScale().fitContent();
      chartApi.timeScale().applyOptions({
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
      });
    };
    syncSizeRef.current = syncSize;

    const scheduleSync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Second frame: wait for CSS grid/deck reflow after breakpoint.
        raf = requestAnimationFrame(syncSize);
      });
    };

    const ro = new ResizeObserver(scheduleSync);
    ro.observe(host);
    if (wrap) ro.observe(wrap);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                scheduleSync();
              }
            },
            { threshold: [0, 0.01, 1] },
          )
        : null;
    if (io && wrap) io.observe(wrap);

    window.addEventListener("resize", scheduleSync);
    scheduleSync();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      window.removeEventListener("resize", scheduleSync);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      syncSizeRef.current = () => {};
      setHoverTip(null);
    };
    // Intentionally omit isMobile / series style props — those swap without remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chart shell only
  }, [height, isSinglePoint]);

  // Tap vs hover — swap listeners only; keep the same chart instance.
  useEffect(() => {
    if (isSinglePoint) return;
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!chart || !host) return;

    const onMove = (param: MouseEventParams<Time>) => {
      if (!showPointMarkersRef.current) {
        setHoverTip(null);
        return;
      }
      const series = seriesRef.current;
      if (
        !series ||
        !param.point ||
        param.time === undefined ||
        !param.seriesData.has(series)
      ) {
        setHoverTip(null);
        return;
      }
      const timeLabel = resolveTimeLabel(param, chart);
      const match = nearestPoint(pointsRef.current, timeLabel);
      if (!match || !param.point) {
        setHoverTip(null);
        return;
      }
      setHoverTip(
        tipFromPoint(
          match,
          param.point,
          host.clientWidth || 200,
          formatValueRef.current,
        ),
      );
    };

    const onClick = (param: MouseEventParams<Time>) => {
      if (!showPointMarkersRef.current) {
        setHoverTip(null);
        return;
      }
      if (!param.point) {
        setHoverTip(null);
        return;
      }
      const timeLabel = resolveTimeLabel(param, chart);
      const match = nearestPoint(pointsRef.current, timeLabel);
      if (!match) {
        setHoverTip(null);
        return;
      }
      if (tipRef.current?.time === match.time) {
        setHoverTip(null);
        return;
      }
      setHoverTip(
        tipFromPoint(
          match,
          param.point,
          host.clientWidth || 200,
          formatValueRef.current,
        ),
      );
    };

    if (isMobile) {
      chart.subscribeClick(onClick);
      return () => chart.unsubscribeClick(onClick);
    }
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [isMobile, isSinglePoint]);

  useEffect(() => {
    if (isSinglePoint) return;
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data: LineData[] = points.map((point) => ({
      time: point.time as Time,
      value: point.value,
    }));
    series.setData(data);
    series.applyOptions({
      color: lineColor,
      lineVisible: lineVisible && points.length >= 2,
      pointMarkersVisible: showPointMarkers,
      crosshairMarkerVisible: showPointMarkers,
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBackgroundColor: lineColor,
    });
    chart.timeScale().fitContent();
    chart.timeScale().applyOptions({
      fixLeftEdge: true,
      fixRightEdge: true,
      rightOffset: 0,
    });
    syncSizeRef.current();
  }, [points, lineColor, lineVisible, showPointMarkers, isSinglePoint]);

  // Breakpoint / deck reflow — force a paint after layout CSS settles.
  useEffect(() => {
    if (isSinglePoint) return;
    const id = window.setTimeout(() => syncSizeRef.current(), 50);
    const id2 = window.setTimeout(() => syncSizeRef.current(), 200);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
    };
  }, [isMobile, isSinglePoint]);

  useEffect(() => {
    if (!isMobile || !hoverTip) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      setHoverTip(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMobile, hoverTip]);

  function showSingleTip(which: "known" | "pending") {
    const point = points[0];
    if (!point || !showPointMarkers) return;
    const tipTime = which === "pending" ? `${point.time}:pending` : point.time;
    if (isMobile && tipRef.current?.time === tipTime) {
      setHoverTip(null);
      return;
    }
    const hostWidth = wrapRef.current?.clientWidth || 200;
    setHoverTip({
      time: tipTime,
      dateLabel:
        which === "pending" ? "Pending Check." : formatSparkDate(point.time),
      valueLabel: which === "pending" ? "—" : formatValue(point.value),
      left: which === "pending" ? Math.max(hostWidth - 88, 0) : 0,
      top: Math.max(height / 2 - 34, 0),
    });
  }

  function clearSingleTip() {
    if (!isMobile) setHoverTip(null);
  }

  return (
    <div
      ref={wrapRef}
      className={className ?? "sparkline-chart"}
      style={{ height, position: "relative" }}
      role="img"
      aria-label={ariaLabel}
    >
      {isSinglePoint ? (
        <div className="helm-metric-spark-single">
          <button
            type="button"
            className="helm-metric-spark-single__hit"
            aria-label={`${formatSparkDate(points[0]!.time)} ${formatValue(points[0]!.value)}`}
            onMouseEnter={isMobile ? undefined : () => showSingleTip("known")}
            onMouseLeave={isMobile ? undefined : clearSingleTip}
            onFocus={isMobile ? undefined : () => showSingleTip("known")}
            onBlur={isMobile ? undefined : clearSingleTip}
            onClick={isMobile ? () => showSingleTip("known") : undefined}
          >
            <span
              className="helm-metric-spark-single__dot helm-metric-spark-single__dot--known"
              style={{ background: lineColor }}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className="helm-metric-spark-single__hit helm-metric-spark-single__hit--end"
            aria-label="Pending Check."
            onMouseEnter={
              isMobile ? undefined : () => showSingleTip("pending")
            }
            onMouseLeave={isMobile ? undefined : clearSingleTip}
            onFocus={isMobile ? undefined : () => showSingleTip("pending")}
            onBlur={isMobile ? undefined : clearSingleTip}
            onClick={isMobile ? () => showSingleTip("pending") : undefined}
          >
            <span
              className="helm-metric-spark-single__dot helm-metric-spark-single__dot--pending"
              aria-hidden
            />
          </button>
        </div>
      ) : (
        <div
          ref={hostRef}
          style={{ width: "100%", height: "100%", minWidth: 0 }}
        />
      )}
      {hoverTip ? (
        <span
          className="helm-metric-spark-tip"
          style={{ left: hoverTip.left, top: hoverTip.top }}
        >
          <span className="helm-metric-spark-tip__date">
            {hoverTip.dateLabel}
          </span>
          <span className="helm-metric-spark-tip__value">
            {hoverTip.valueLabel}
          </span>
        </span>
      ) : null}
    </div>
  );
}
