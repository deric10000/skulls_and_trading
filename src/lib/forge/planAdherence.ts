/**
 * Plan Adherence pure helpers — notification counts, action tallies, and
 * zone-followed impact (forward return after plan-aligned fills).
 * No I/O; feed events + ledger + price marks from the caller.
 */

import type {
  PortfolioTransaction,
  StatusType,
  TransactionActionClass,
} from "../../types";
import type { HelmTimeframeBounds } from "../finance/helmTimeframe";

export type ForgeCheckEventKind = "status" | "hold";

export interface ForgeCheckEvent {
  id?: number;
  portfolioId: string;
  strategyId: string;
  ticker: string;
  checkedAt: string;
  asOf: string;
  kind: ForgeCheckEventKind;
  primaryStatus: string | null;
  flags: StatusType[];
  conviction: number | null;
}

/** Price mark for Impact horizon (from conviction_snapshots.payload). */
export interface TickerPriceMark {
  ticker: string;
  asOf: string;
  lastPrice: number;
}

const ZONE_ACTION: Record<
  "Trim Zone" | "Add Zone" | "Go to Cash",
  TransactionActionClass[]
> = {
  "Trim Zone": ["trim", "go_to_cash"],
  "Add Zone": ["add"],
  "Go to Cash": ["go_to_cash", "trim"],
};

export const IMPACT_HORIZON_SESSIONS = 5;

function inBounds(iso: string, bounds: HelmTimeframeBounds): boolean {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    // Date-only: compare as_of calendar days.
    return iso >= bounds.fromDate && iso <= bounds.toDate;
  }
  const from = Date.parse(bounds.fromIso);
  const to = Date.parse(bounds.toIso);
  return ms >= from && ms <= to;
}

function eventInScope(
  event: ForgeCheckEvent,
  portfolioId: string,
  strategyIds: string[] | null,
): boolean {
  if (event.portfolioId !== portfolioId) return false;
  if (strategyIds && strategyIds.length > 0) {
    return strategyIds.includes(event.strategyId);
  }
  return true;
}

/** Count primary + distinct flags per status check event. */
export function countNotifications(
  events: ForgeCheckEvent[],
  portfolioId: string,
  strategyIds: string[] | null,
  bounds: HelmTimeframeBounds,
): number {
  let total = 0;
  for (const event of events) {
    if (event.kind !== "status") continue;
    if (!eventInScope(event, portfolioId, strategyIds)) continue;
    if (!inBounds(event.checkedAt, bounds) && !inBounds(event.asOf, bounds)) {
      continue;
    }
    const labels = new Set<string>();
    if (event.primaryStatus) labels.add(event.primaryStatus);
    for (const flag of event.flags) {
      if (flag) labels.add(flag);
    }
    total += labels.size;
  }
  return total;
}

function eventKey(event: ForgeCheckEvent): string {
  return `${event.strategyId}:${event.asOf}:${event.ticker}:${event.kind}`;
}

/** Qty fill on the same ET/session calendar day as a check (proxy bucket). */
function hadQtyFillOnAsOf(
  ledger: PortfolioTransaction[] | undefined,
  portfolioId: string,
  ticker: string,
  asOf: string,
): boolean {
  if (!ledger?.length) return false;
  const sym = ticker.toUpperCase();
  for (const tx of ledger) {
    if (tx.kind !== "qty") continue;
    if (tx.portfolioId !== portfolioId) continue;
    if (tx.ticker.toUpperCase() !== sym) continue;
    // Prefer calendar prefix; filledAt ISO dates are stored as wall timestamps.
    if (tx.filledAt.slice(0, 10) === asOf) return true;
  }
  return false;
}

/**
 * Prefer append-only forge_check_events. Fill gaps from ticker conviction
 * snapshots and book check-day marks so Helm Notifications / Holds stay
 * consistent with Total Conviction when events were not yet written.
 */
export function mergeCheckEventsWithProxies(input: {
  events: ForgeCheckEvent[];
  portfolioId: string;
  /** Ticker rows with primary status (conviction_snapshots). */
  snapshotRows: Array<{
    strategyId: string;
    ticker: string;
    asOf: string;
    conviction: number;
    status: string | null;
  }>;
  /** Book rows with metrics.conviction (portfolio_snapshots). */
  bookCheckDays: Array<{
    strategyId: string;
    asOf: string;
    conviction: number;
  }>;
  /** In-scope tickers for book-day proxy (one status pulse per name). */
  tickers: string[];
  /** Ledger used to decide Hold vs traded on a check day. */
  ledger?: PortfolioTransaction[];
}): ForgeCheckEvent[] {
  const byKey = new Map<string, ForgeCheckEvent>();
  for (const event of input.events) {
    byKey.set(eventKey(event), event);
  }

  for (const row of input.snapshotRows) {
    if (!Number.isFinite(row.conviction) || row.conviction === 0) continue;
    if (!row.status) continue;
    const event: ForgeCheckEvent = {
      portfolioId: input.portfolioId,
      strategyId: row.strategyId,
      ticker: row.ticker.toUpperCase(),
      checkedAt: `${row.asOf}T20:00:00.000Z`,
      asOf: row.asOf,
      kind: "status",
      primaryStatus: row.status,
      flags: [row.status as StatusType],
      conviction: row.conviction,
    };
    const key = eventKey(event);
    if (!byKey.has(key)) byKey.set(key, event);
  }

  const coveredDays = new Set<string>();
  for (const event of byKey.values()) {
    if (event.kind === "status") {
      coveredDays.add(`${event.strategyId}:${event.asOf}`);
    }
  }

  const bookConvictionByDay = new Map<string, number>();
  for (const day of input.bookCheckDays) {
    if (!Number.isFinite(day.conviction) || day.conviction === 0) continue;
    if (!day.strategyId) continue;
    bookConvictionByDay.set(`${day.strategyId}:${day.asOf}`, day.conviction);
    const dayKey = `${day.strategyId}:${day.asOf}`;
    if (coveredDays.has(dayKey)) continue;
    const primary = bandFromConviction(day.conviction);
    for (const ticker of input.tickers) {
      const event: ForgeCheckEvent = {
        portfolioId: input.portfolioId,
        strategyId: day.strategyId,
        ticker: ticker.toUpperCase(),
        checkedAt: `${day.asOf}T20:00:00.000Z`,
        asOf: day.asOf,
        kind: "status",
        primaryStatus: primary,
        flags: [primary],
        conviction: day.conviction,
      };
      const key = eventKey(event);
      if (!byKey.has(key)) byKey.set(key, event);
    }
    coveredDays.add(dayKey);
  }

  // Hold proxy: every status check day × in-scope ticker with no same-day qty
  // fill. Real `kind: "hold"` rows from forge_check_events win via byKey.
  const statusDays = new Map<string, { strategyId: string; asOf: string }>();
  for (const event of byKey.values()) {
    if (event.kind !== "status") continue;
    statusDays.set(`${event.strategyId}:${event.asOf}`, {
      strategyId: event.strategyId,
      asOf: event.asOf,
    });
  }
  for (const { strategyId, asOf } of statusDays.values()) {
    const dayConv = bookConvictionByDay.get(`${strategyId}:${asOf}`) ?? null;
    for (const raw of input.tickers) {
      const ticker = raw.toUpperCase();
      if (hadQtyFillOnAsOf(input.ledger, input.portfolioId, ticker, asOf)) {
        continue;
      }
      const hold: ForgeCheckEvent = {
        portfolioId: input.portfolioId,
        strategyId,
        ticker,
        checkedAt: `${asOf}T20:00:00.000Z`,
        asOf,
        kind: "hold",
        primaryStatus: null,
        flags: [],
        conviction: dayConv,
      };
      const key = eventKey(hold);
      if (!byKey.has(key)) byKey.set(key, hold);
    }
  }

  return Array.from(byKey.values());
}

/** Mirror status.ts band labels for book-mark proxies (no I/O). */
function bandFromConviction(conviction: number): StatusType {
  if (conviction >= 90) return "High Alignment";
  if (conviction >= 70) return "Aligned";
  if (conviction >= 40) return "Watch";
  return "Review";
}

export interface ActionCounts {
  total: number;
  buy: number;
  sell: number;
  deposit: number;
  withdrawal: number;
  hold: number;
}

export function countActions(
  ledger: PortfolioTransaction[],
  events: ForgeCheckEvent[],
  portfolioId: string,
  strategyIds: string[] | null,
  bounds: HelmTimeframeBounds,
): ActionCounts {
  const out: ActionCounts = {
    total: 0,
    buy: 0,
    sell: 0,
    deposit: 0,
    withdrawal: 0,
    hold: 0,
  };

  for (const tx of ledger) {
    if (tx.portfolioId !== portfolioId) continue;
    if (!inBounds(tx.filledAt, bounds)) continue;
    if (strategyIds && strategyIds.length > 0) {
      const ids = tx.strategyIds ?? [];
      if (ids.length > 0 && !ids.some((id) => strategyIds.includes(id))) {
        continue;
      }
    }
    if (tx.kind === "cash") {
      if (tx.actionClass === "deposit" || (tx.deltaCash > 0 && !tx.actionClass)) {
        out.deposit += 1;
      } else if (
        tx.actionClass === "withdrawal" ||
        (tx.deltaCash < 0 && !tx.actionClass)
      ) {
        out.withdrawal += 1;
      } else {
        continue;
      }
    } else if (tx.side === "buy") {
      out.buy += 1;
    } else if (tx.side === "sell") {
      out.sell += 1;
    } else {
      continue;
    }
    out.total += 1;
  }

  for (const event of events) {
    if (event.kind !== "hold") continue;
    if (!eventInScope(event, portfolioId, strategyIds)) continue;
    if (!inBounds(event.checkedAt, bounds) && !inBounds(event.asOf, bounds)) {
      continue;
    }
    out.hold += 1;
    out.total += 1;
  }

  return out;
}

/**
 * Forward return % for a zone-followed fill using the Nth later session mark.
 * Trim/Go-to-Cash sells: positive when price fell after the sell.
 * Add buys: positive when price rose after the buy.
 */
export function forwardReturnPct(input: {
  side: "buy" | "sell";
  fillPrice: number;
  horizonPrice: number;
}): number | null {
  const { side, fillPrice, horizonPrice } = input;
  if (!(fillPrice > 0) || !(horizonPrice > 0)) return null;
  if (side === "buy") {
    return ((horizonPrice - fillPrice) / fillPrice) * 100;
  }
  return ((fillPrice - horizonPrice) / fillPrice) * 100;
}

function horizonPriceForFill(
  ticker: string,
  filledAt: string,
  marks: TickerPriceMark[],
  horizonSessions: number,
): number | null {
  const fillDay = filledAt.slice(0, 10);
  const after = marks
    .filter(
      (m) =>
        m.ticker.toUpperCase() === ticker.toUpperCase() && m.asOf > fillDay,
    )
    .sort((a, b) => a.asOf.localeCompare(b.asOf));
  if (after.length === 0) return null;
  const idx = Math.min(horizonSessions, after.length) - 1;
  const mark = after[idx];
  return mark && mark.lastPrice > 0 ? mark.lastPrice : null;
}

function dayHadZone(
  events: ForgeCheckEvent[],
  ticker: string,
  asOf: string,
  zone: StatusType,
  strategyIds: string[] | null,
): boolean {
  for (const event of events) {
    if (event.kind !== "status") continue;
    if (event.ticker.toUpperCase() !== ticker.toUpperCase()) continue;
    if (event.asOf !== asOf) continue;
    if (
      strategyIds &&
      strategyIds.length > 0 &&
      !strategyIds.includes(event.strategyId)
    ) {
      continue;
    }
    if (event.primaryStatus === zone) return true;
    if (event.flags.includes(zone)) return true;
  }
  return false;
}

function fillMatchesZone(
  tx: Extract<PortfolioTransaction, { kind: "qty" }>,
  zone: keyof typeof ZONE_ACTION,
  events: ForgeCheckEvent[],
  strategyIds: string[] | null,
): boolean {
  const allowed = ZONE_ACTION[zone];
  const action = tx.actionClass;
  const actionOk = action
    ? allowed.includes(action)
    : zone === "Add Zone"
      ? tx.side === "buy"
      : tx.side === "sell";
  if (!actionOk) return false;

  const hints = tx.zoneHints ?? [];
  if (hints.includes(zone)) return true;

  // Historical fills often have empty zoneHints — match check-day flags.
  const asOf = tx.filledAt.slice(0, 10);
  return dayHadZone(events, tx.ticker, asOf, zone, strategyIds);
}

export interface ZoneImpactResult {
  /** MV-weighted average forward return %; null when no matched fills. */
  avgReturnPct: number | null;
  matchedFills: number;
  /** Qty actions considered in-range (for empty-state copy). */
  consideredFills: number;
  horizonSessions: number;
}

/**
 * Zone-followed Impact (Plan Adherence metric 3 / B):
 * fills whose zoneHints (or same-day check flags) match Trim/Add/Go to Cash,
 * scored by forward return.
 */
export function computeZoneFollowedImpact(
  ledger: PortfolioTransaction[],
  priceMarks: TickerPriceMark[],
  portfolioId: string,
  strategyIds: string[] | null,
  bounds: HelmTimeframeBounds,
  horizonSessions = IMPACT_HORIZON_SESSIONS,
  checkEvents: ForgeCheckEvent[] = [],
): ZoneImpactResult {
  let weightSum = 0;
  let weightedReturn = 0;
  let matched = 0;
  let considered = 0;

  for (const tx of ledger) {
    if (tx.kind !== "qty") continue;
    if (tx.portfolioId !== portfolioId) continue;
    if (!inBounds(tx.filledAt, bounds)) continue;
    if (strategyIds && strategyIds.length > 0) {
      const ids = tx.strategyIds ?? [];
      if (ids.length > 0 && !ids.some((id) => strategyIds.includes(id))) {
        continue;
      }
    }
    considered += 1;

    const zones = (
      ["Trim Zone", "Add Zone", "Go to Cash"] as const
    ).filter((z) => fillMatchesZone(tx, z, checkEvents, strategyIds));
    if (zones.length === 0) continue;

    const horizon = horizonPriceForFill(
      tx.ticker,
      tx.filledAt,
      priceMarks,
      horizonSessions,
    );
    if (horizon == null) continue;
    const ret = forwardReturnPct({
      side: tx.side,
      fillPrice: tx.fillPrice,
      horizonPrice: horizon,
    });
    if (ret == null) continue;

    const notional = Math.abs(tx.deltaShares) * tx.fillPrice;
    const weight = notional > 0 ? notional : 1;
    weightedReturn += ret * weight;
    weightSum += weight;
    matched += 1;
  }

  return {
    avgReturnPct: matched > 0 && weightSum > 0 ? weightedReturn / weightSum : null,
    matchedFills: matched,
    consideredFills: considered,
    horizonSessions,
  };
}

/**
 * Whether a qty buy/sell for ticker landed inside the cadence bucket ending
 * at checkedAt (exclusive of prior bucket start).
 */
export function hadQtyFillInBucket(input: {
  ledger: PortfolioTransaction[];
  portfolioId: string;
  ticker: string;
  bucketStartIso: string;
  checkedAtIso: string;
}): boolean {
  const ticker = input.ticker.toUpperCase();
  const start = Date.parse(input.bucketStartIso);
  const end = Date.parse(input.checkedAtIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  for (const tx of input.ledger) {
    if (tx.kind !== "qty") continue;
    if (tx.portfolioId !== input.portfolioId) continue;
    if (tx.ticker.toUpperCase() !== ticker) continue;
    const filled = Date.parse(tx.filledAt);
    if (Number.isNaN(filled)) continue;
    if (filled > start && filled <= end) return true;
  }
  return false;
}
