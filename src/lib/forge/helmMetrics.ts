import type { Portfolio, SignalTone } from "../../types";
import { STATUS_TONE } from "../status";
import { portfolioRunningTotals } from "../finance/portfolioTotals";
import type { PortfolioAlignment } from "./alignment";

/**
 * Helm progress metrics — pure derivation over an already-computed
 * `PortfolioAlignment` plus the portfolio's holdings. No I/O: the price lookup
 * is injected so this stays testable and side-effect free (the `dataSource`
 * seam is read once, in the calling component). Everything here is derived from
 * data already in the app — no new persisted fields or accessors.
 *
 * When `tickerInScope` is provided (Helm strategy dropdown), every metric —
 * including Open P&L — is reduced over that ticker set only. Omit it for the
 * All-strategies / whole-book view.
 */

export interface HelmStatusSlice {
  tone: SignalTone;
  count: number;
}

export interface HelmCompositionSlice {
  label: string;
  count: number;
}

export interface HelmMetrics {
  /** Held names (shares > 0, in scope) that scored against an applied strategy. */
  scoredCount: number;
  /** Held names total (shares > 0, in scope). */
  holdingCount: number;
  /** scoredCount / holdingCount as a 0–100 percentage (0 when no holdings). */
  coveragePct: number;
  /** Market-value-weighted portfolio conviction, 0–100. */
  conviction: number;
  /**
   * Aggregate open P&L % (open P&L / cost basis) over in-scope holdings —
   * same formula as Current Watch (`portfolioRunningTotals`), scoped when a
   * single strategy is selected.
   */
  openPnlPct: number;
  /** Alignment status counts grouped by tone (positive→negative, zeros dropped). */
  statusMix: HelmStatusSlice[];
  /**
   * Held names waiting on a cadence check (add/apply/update or no last check).
   * Excluded from `statusMix` so they never inflate On Plan / Watch / etc.
   */
  pendingScoreCount: number;
  /** Composition by each ticker's headline bucket/lens, most names first. */
  composition: HelmCompositionSlice[];
}

const TONE_ORDER: SignalTone[] = ["positive", "neutral", "warning", "negative"];

export function computeHelmMetrics({
  portfolio,
  alignment,
  priceOf,
  tickerInScope,
  isScoreReady,
}: {
  portfolio: Portfolio | undefined;
  alignment: PortfolioAlignment;
  priceOf: (ticker: string) => number;
  /** When set, only these tickers contribute to every metric (incl. Open P&L). */
  tickerInScope?: (ticker: string) => boolean;
  /**
   * When false, the holding is counted under `pendingScoreCount` and omitted
   * from Plan Alignment tone chips (not treated as On Plan).
   */
  isScoreReady?: (ticker: string) => boolean;
}): HelmMetrics {
  const holdings = (portfolio?.holdings ?? []).filter(
    (h) => h.shares > 0 && (tickerInScope?.(h.ticker) ?? true),
  );
  const holdingCount = holdings.length;

  const byTicker = alignment.byTicker;
  const scoredCount = holdings.filter((h) => byTicker[h.ticker]).length;
  const coveragePct =
    holdingCount > 0 ? Math.round((scoredCount / holdingCount) * 100) : 0;

  // Same aggregate formula as Current Watch — over the in-scope holdings only.
  const openPnlPct = portfolioRunningTotals(
    holdings.map((holding) => ({
      price: priceOf(holding.ticker),
      shares: holding.shares,
      avgPrice: holding.avgPrice,
    })),
  ).openPnlPct;

  // Status mix + composition come from each held name's headline alignment.
  const toneCounts = new Map<SignalTone, number>();
  const bucketCounts = new Map<string, number>();
  let pendingScoreCount = 0;
  for (const holding of holdings) {
    const entry = byTicker[holding.ticker];
    if (!entry) continue;
    if (isScoreReady && !isScoreReady(holding.ticker)) {
      pendingScoreCount += 1;
      continue;
    }
    const tone = STATUS_TONE[entry.status] ?? "neutral";
    toneCounts.set(tone, (toneCounts.get(tone) ?? 0) + 1);
    // Composition = one tile per real lens/bucket. A merged multi-strategy
    // headline is joined with " + " in alignment.ts, so split it back into the
    // individual strategies the name genuinely belongs to (honest membership).
    // A single strategy/bucket name (which may itself contain commas, e.g.
    // "Value, Growth, Dividend") is one real type — never split on commas, or
    // we would fabricate per-lens counts the data does not support.
    const label = entry.bucketName || "Unassigned";
    for (const part of label.split(" + ")) {
      const lens = part.trim();
      if (!lens) continue;
      bucketCounts.set(lens, (bucketCounts.get(lens) ?? 0) + 1);
    }
  }

  const statusMix: HelmStatusSlice[] = TONE_ORDER.filter(
    (tone) => (toneCounts.get(tone) ?? 0) > 0,
  ).map((tone) => ({ tone, count: toneCounts.get(tone)! }));

  const composition: HelmCompositionSlice[] = Array.from(bucketCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    scoredCount,
    holdingCount,
    coveragePct,
    conviction: alignment.portfolio.conviction,
    openPnlPct,
    statusMix,
    pendingScoreCount,
    composition,
  };
}
