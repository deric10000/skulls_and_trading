/**
 * Build + persist append-only forge_check_events after a strategy check.
 * Status rows carry primary + flags; hold rows when no qty fill in the cadence bucket.
 */

import type { Portfolio, PortfolioTransaction, StatusType, Strategy } from "../../types";
import { dataSource } from "../datasource";
import { etIsoDate } from "../finance/portfolioSnapshotSeries";
import {
  hadQtyFillInBucket,
  type ForgeCheckEvent,
} from "../forge/planAdherence";
import { computePortfolioAlignment } from "../forge/alignment";
import { INTERVAL_MS } from "../forge/scheduler";
import { shouldScoreTickerWithStrategy } from "../forge/tickerStrategy";
import { appendForgeCheckEvents } from "../userStore";
import type { CandleInterval, CheckInterval } from "../../types";

function isCandle(interval: CheckInterval): interval is CandleInterval {
  return interval in INTERVAL_MS;
}

function bucketStartIso(checkedAt: string, strategy: Strategy): string {
  const end = Date.parse(checkedAt);
  if (Number.isNaN(end)) return checkedAt;
  const primary = strategy.checkInterval ?? "1D";
  const ms = isCandle(primary)
    ? INTERVAL_MS[primary]
    : INTERVAL_MS["1D"];
  return new Date(end - ms).toISOString();
}

/** Pure: build status + hold events for one strategy check. */
export function buildForgeCheckEvents(input: {
  portfolios: Portfolio[];
  strategies: Strategy[];
  strategyId: string;
  ledger: PortfolioTransaction[];
  checkedAt?: string;
}): ForgeCheckEvent[] {
  const strategy = input.strategies.find((s) => s.id === input.strategyId);
  if (!strategy) return [];
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const asOf = etIsoDate(checkedAt);
  const bucketStart = bucketStartIso(checkedAt, strategy);
  const buckets = dataSource.getBuckets();
  const out: ForgeCheckEvent[] = [];

  for (const portfolio of input.portfolios) {
    if (!(strategy.appliedPortfolioIds ?? []).includes(portfolio.id)) continue;
    const alignment = computePortfolioAlignment(portfolio, buckets, [strategy]);
    for (const holding of portfolio.holdings) {
      if (!shouldScoreTickerWithStrategy(holding, strategy, portfolio.id)) {
        continue;
      }
      const ticker = holding.ticker.toUpperCase();
      const live = alignment.byTicker[ticker] ?? alignment.byTicker[holding.ticker];
      if (live) {
        const flags = (live.resolved.categoryFlags ?? []) as StatusType[];
        out.push({
          portfolioId: portfolio.id,
          strategyId: strategy.id,
          ticker,
          checkedAt,
          asOf,
          kind: "status",
          primaryStatus: live.resolved.primary ?? live.status ?? null,
          flags,
          conviction: Number.isFinite(live.conviction) ? live.conviction : null,
        });
      }

      const traded = hadQtyFillInBucket({
        ledger: input.ledger,
        portfolioId: portfolio.id,
        ticker,
        bucketStartIso: bucketStart,
        checkedAtIso: checkedAt,
      });
      if (!traded) {
        out.push({
          portfolioId: portfolio.id,
          strategyId: strategy.id,
          ticker,
          checkedAt,
          asOf,
          kind: "hold",
          primaryStatus: null,
          flags: [],
          conviction: live && Number.isFinite(live.conviction) ? live.conviction : null,
        });
      }
    }
  }

  return out;
}

/** Persist check events; returns error message when the write fails. */
export async function persistForgeCheckEvents(input: {
  portfolios: Portfolio[];
  strategies: Strategy[];
  strategyId: string;
  ledger: PortfolioTransaction[];
  checkedAt?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const rows = buildForgeCheckEvents(input);
  if (rows.length === 0) return { ok: true };
  return appendForgeCheckEvents(rows);
}
