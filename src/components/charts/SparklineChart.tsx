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
};

function formatSparkDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

type HoverTip = {
  label: string;
  left: number;
  top: number;
};

/**
 * Compact TradingView lightweight-charts line — no chrome, no axes labels
 * beyond what the parent renders. Lazy-load this module from Helm only.
 */
export function SparklineChart({
  points,
  lineColor,
  height = 48,
  className,
  showPointMarkers = true,
  lineVisible = true,
}: SparklineChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      height,
      width: host.clientWidth || 200,
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

    const onMove = (param: MouseEventParams<Time>) => {
      if (!showPointMarkers) {
        setHoverTip(null);
        return;
      }
      if (
        !param.point ||
        param.time === undefined ||
        !param.seriesData.has(series)
      ) {
        setHoverTip(null);
        return;
      }
      // Day series uses UTC ISO date strings as Time.
      const timeLabel = typeof param.time === "string" ? param.time : null;
      if (!timeLabel) {
        setHoverTip(null);
        return;
      }
      // Axis already labels first/last — hover dates are for in-between dots.
      const seriesPoints = pointsRef.current;
      const first = seriesPoints[0]?.time;
      const last = seriesPoints[seriesPoints.length - 1]?.time;
      if (
        seriesPoints.length >= 2 &&
        (timeLabel === first || timeLabel === last)
      ) {
        setHoverTip(null);
        return;
      }
      const hostWidth = host.clientWidth || 200;
      const tipWidth = 76;
      const left = Math.min(
        Math.max(param.point.x - tipWidth / 2, 0),
        Math.max(hostWidth - tipWidth, 0),
      );
      setHoverTip({
        label: formatSparkDate(timeLabel),
        left,
        top: Math.max(param.point.y - 22, 0),
      });
    };

    chart.subscribeCrosshairMove(onMove);

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: hostRef.current.clientWidth,
      });
    });
    ro.observe(host);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setHoverTip(null);
    };
  }, [height, lineColor, lineVisible, showPointMarkers]);

  useEffect(() => {
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
  }, [points, lineColor, lineVisible, showPointMarkers]);

  return (
    <div
      className={className ?? "sparkline-chart"}
      style={{ height, position: "relative" }}
      role="img"
      aria-label="Open P&L history"
    >
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      {hoverTip ? (
        <span
          className="helm-pnl-spark-tip"
          style={{ left: hoverTip.left, top: hoverTip.top }}
        >
          {hoverTip.label}
        </span>
      ) : null}
    </div>
  );
}
