import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";
import type { SparkPoint } from "../../lib/finance/portfolioSnapshotSeries";

export type SparklineChartProps = {
  points: SparkPoint[];
  /** CSS color for the line (token-resolved by caller). */
  lineColor: string;
  height?: number;
  className?: string;
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
}: SparklineChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

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
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: hostRef.current.clientWidth,
      });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, lineColor]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data: LineData[] = points.map((point) => ({
      time: point.time as Time,
      value: point.value,
    }));
    series.setData(data);
    series.applyOptions({ color: lineColor });
    chart.timeScale().fitContent();
  }, [points, lineColor]);

  return (
    <div
      ref={hostRef}
      className={className ?? "sparkline-chart"}
      style={{ height }}
      role="img"
      aria-label="Open P&L history"
    />
  );
}
