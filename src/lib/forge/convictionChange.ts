import type { RuleCategory } from "../../types";
import type { PortfolioAlignment } from "../forge/alignment";
import type { PortfolioSnapshotRecord } from "../userStore";

/** Short driver labels — scannable on the Conviction card. */
export const DRIVER_CATEGORY_LABEL: Record<RuleCategory, string> = {
  thesis: "Thesis Fit",
  setup: "Technical Setup",
  risk: "Risk",
  position: "Position Size",
  timeframe: "Hold Timeframe",
  trade: "Trade Management",
};

export interface ConvictionMark {
  asOf: string;
  conviction: number;
}

export interface ConvictionChange {
  /** Live conviction − prior session mark (points on 0–100 scale). */
  todayDelta: number | null;
  /** Live conviction − mark from 5 sessions ago. */
  sessions5Delta: number | null;
}

export interface ConvictionDriver {
  ticker: string;
  categoryLabel: string;
  /** Signed contribution toward the book change (points, approx). */
  delta: number;
}

export interface ConvictionChangeView {
  change: ConvictionChange;
  drivers: ConvictionDriver[];
  /** One-line product-voice summary; null when nothing honest to say. */
  driverSummary: string | null;
}

/** Pull portfolio-level conviction marks from snapshot `metrics.conviction`. */
export function portfolioConvictionSeries(
  rows: PortfolioSnapshotRecord[],
): ConvictionMark[] {
  const out: ConvictionMark[] = [];
  for (const row of rows) {
    const raw = row.metrics?.conviction;
    const conviction = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(conviction)) continue;
    out.push({ asOf: row.asOf, conviction });
  }
  return out;
}

/**
 * Compare live book conviction to prior daily marks.
 * Does not fabricate history — null deltas when marks are missing.
 */
export function computeConvictionChange(
  liveConviction: number,
  series: ConvictionMark[],
  today = new Date().toISOString().slice(0, 10),
): ConvictionChange {
  if (!Number.isFinite(liveConviction)) {
    return { todayDelta: null, sessions5Delta: null };
  }
  const prior = series.filter((mark) => mark.asOf < today);
  const yesterday = prior.length > 0 ? prior[prior.length - 1] : null;
  const fiveBack =
    prior.length >= 5 ? prior[prior.length - 5] : null;

  return {
    todayDelta: yesterday
      ? liveConviction - yesterday.conviction
      : null,
    sessions5Delta: fiveBack
      ? liveConviction - fiveBack.conviction
      : null,
  };
}

export interface TickerConvictionMark {
  ticker: string;
  asOf: string;
  conviction: number;
  marketValue?: number;
}

/**
 * Top movers between the two most recent as_of days (prior → latest in history),
 * labeled with the live weakest category for that ticker.
 */
export function computeConvictionDrivers(
  marks: TickerConvictionMark[],
  alignment: PortfolioAlignment,
  limit = 2,
): ConvictionDriver[] {
  const byAsOf = new Map<string, TickerConvictionMark[]>();
  for (const mark of marks) {
    const list = byAsOf.get(mark.asOf) ?? [];
    list.push(mark);
    byAsOf.set(mark.asOf, list);
  }
  const days = Array.from(byAsOf.keys()).sort();
  if (days.length < 2) return [];
  const prevDay = days[days.length - 2]!;
  const lastDay = days[days.length - 1]!;
  const prev = new Map(
    (byAsOf.get(prevDay) ?? []).map((m) => [m.ticker.toUpperCase(), m]),
  );
  const last = new Map(
    (byAsOf.get(lastDay) ?? []).map((m) => [m.ticker.toUpperCase(), m]),
  );

  const movers: ConvictionDriver[] = [];
  for (const [ticker, lastMark] of last) {
    const prevMark = prev.get(ticker);
    if (!prevMark) continue;
    const rawDelta = lastMark.conviction - prevMark.conviction;
    if (!Number.isFinite(rawDelta) || rawDelta === 0) continue;
    const mv =
      lastMark.marketValue ??
      prevMark.marketValue ??
      1;
    const entry = alignment.byTicker[ticker] ?? alignment.byTicker[lastMark.ticker];
    const weakest = entry?.alignment.categories
      .filter((c) => c.score != null && Number.isFinite(c.score))
      .slice()
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];
    const categoryLabel = weakest
      ? DRIVER_CATEGORY_LABEL[weakest.category]
      : entry?.status ?? "Alignment";
    movers.push({
      ticker,
      categoryLabel,
      delta: rawDelta * (mv > 0 ? mv : 1),
    });
  }

  // Prefer names that moved the book the most (abs contribution).
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return movers.slice(0, limit).map((m) => ({
    ...m,
    // Unweight for display sorting already done; keep signed raw-ish sense
    // by normalizing back toward conviction points for summary direction.
    delta: m.delta,
  }));
}

export function formatConvictionDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  if (rounded < 0) return rounded.toFixed(1).replace("-", "−");
  return "0.0";
}

export function summarizeConvictionDrivers(
  change: ConvictionChange,
  drivers: ConvictionDriver[],
): string | null {
  if (drivers.length === 0) return null;
  const today = change.todayDelta;
  const direction =
    today != null && today < 0
      ? "Declined"
      : today != null && today > 0
        ? "Rose"
        : drivers.every((d) => d.delta < 0)
          ? "Declined"
          : drivers.every((d) => d.delta > 0)
            ? "Rose"
            : "Moved";
  const parts = drivers.map((d) => `${d.ticker} ${d.categoryLabel}`);
  if (parts.length === 1) {
    return `${direction} primarily from ${parts[0]}.`;
  }
  return `${direction} primarily from ${parts[0]} and ${parts[1]}.`;
}

export function buildConvictionChangeView(
  liveConviction: number,
  bookSeries: ConvictionMark[],
  tickerMarks: TickerConvictionMark[],
  alignment: PortfolioAlignment,
  today = new Date().toISOString().slice(0, 10),
): ConvictionChangeView {
  const change = computeConvictionChange(liveConviction, bookSeries, today);
  const drivers = computeConvictionDrivers(tickerMarks, alignment);
  return {
    change,
    drivers,
    driverSummary: summarizeConvictionDrivers(change, drivers),
  };
}
