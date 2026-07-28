/**
 * Budget-aware Weather taxonomy hydrate — isolated from Forge scoring,
 * technicals, conviction cadence, and scoreInputs invalidation.
 *
 * Fetches Yahoo quoteSummary (assetProfile on the same fundamentals call),
 * writes taxonomy-only into liveCache, and yields when the soft Yahoo budget
 * is low so the hourly market cycle keeps headroom.
 *
 * Logout durability: in-memory queue clears with resetLiveCache; symbols stay
 * registered server-side and complete on the next published cycle.
 */

import { TICKERS } from "../../data";
import { fetchMarketFundamentals } from "../market/client";
import {
  getLiveTaxonomy,
  getMarketCycleMeta,
  getProviderBudgets,
  getWeatherTaxonomyReadiness,
  hasMappedWeatherTaxonomy,
  markWeatherTaxonomyFailed,
  markWeatherTaxonomyPending,
  markWeatherTaxonomyReady,
  onLiveCacheReset,
  setLiveTaxonomyFromFundamentals,
  setProviderBudgets,
  setWeatherTaxonomyEta,
  synthesizeNextCycleEtaAt,
} from "../market/liveCache";

/** Keep Yahoo soft headroom for the hourly conviction cycle. */
const YAHOO_HEADROOM = 8;
/** One-at-a-time so add-batch cannot spike the isolate soft budget. */
const MAX_CONCURRENT = 1;
/** Soft ETA pacing (~10 tickers/minute comfort when quotes are Finnhub-backed). */
const MS_PER_TICKER = 6_000;
const BUDGET_RETRY_MS = 15_000;

type HydrateJob = { ticker: string };

const queue: HydrateJob[] = [];
const queued = new Set<string>();
const inFlight = new Set<string>();
/** One soft-hydrate attempt per ticker per session (cycle remains durable). */
const attempted = new Set<string>();
let active = 0;
let budgetRetryTimer: ReturnType<typeof setTimeout> | null = null;

onLiveCacheReset(() => {
  queue.length = 0;
  queued.clear();
  inFlight.clear();
  attempted.clear();
  active = 0;
  if (budgetRetryTimer != null) {
    clearTimeout(budgetRetryTimer);
    budgetRetryTimer = null;
  }
});

function yahooRemaining(): number {
  const yahoo = getProviderBudgets().find((b) => b.id === "yahoo");
  // Unknown budget → allow a single attempt; known low → yield to cron.
  return yahoo?.remaining ?? YAHOO_HEADROOM + 1;
}

function seededTaxonomyReady(ticker: string): boolean {
  const seeded = TICKERS[ticker.toUpperCase()];
  return Boolean(seeded?.sector && seeded?.industry);
}

/** Never null — soft queue, published cycle, or next UTC hour. */
function durableEtaAt(queueIndex = 0): string {
  const soft = softQueueEtaAt(queueIndex);
  const cycle = getMarketCycleMeta()?.nextCycleAt;
  if (cycle) {
    const softMs = Date.parse(soft);
    const cycleMs = Date.parse(cycle);
    // Prefer the sooner honest target so the countdown moves.
    if (Number.isFinite(cycleMs) && cycleMs < softMs) return cycle;
  }
  return soft;
}

function cycleOrFallbackEtaAt(): string {
  return getMarketCycleMeta()?.nextCycleAt ?? synthesizeNextCycleEtaAt();
}

function softQueueEtaAt(queueIndex: number): string {
  const etaMs = Date.now() + (queueIndex + 1) * MS_PER_TICKER;
  return new Date(etaMs).toISOString();
}

function refreshPendingEtas(): void {
  let index = 0;
  for (const job of queue) {
    setWeatherTaxonomyEta(job.ticker, durableEtaAt(index));
    index += 1;
  }
  for (const ticker of inFlight) {
    setWeatherTaxonomyEta(ticker, durableEtaAt(0));
  }
}

function scheduleBudgetRetry(): void {
  if (budgetRetryTimer != null) return;
  // While yielding to cron, point the countdown at the durable cycle clock —
  // never wipe etaAt to null (that blanks the UI countdown).
  const eta = cycleOrFallbackEtaAt();
  for (const job of queue) {
    setWeatherTaxonomyEta(job.ticker, eta);
  }
  budgetRetryTimer = setTimeout(() => {
    budgetRetryTimer = null;
    pump();
  }, BUDGET_RETRY_MS);
}

async function runJob(ticker: string): Promise<void> {
  inFlight.add(ticker);
  setWeatherTaxonomyEta(ticker, durableEtaAt(0));
  try {
    const result = await fetchMarketFundamentals(ticker);
    if (result?.budgets) setProviderBudgets(result.budgets);

    const snapshot = result?.fundamentals;
    if (!snapshot) {
      // Transient miss — stay pending on the durable cycle clock; Layer-3
      // warning only after a completed mapping attempt returns incomplete.
      markWeatherTaxonomyPending(ticker, cycleOrFallbackEtaAt());
      return;
    }

    setLiveTaxonomyFromFundamentals(ticker, snapshot);
    if (!hasMappedWeatherTaxonomy(ticker)) {
      const readiness = getWeatherTaxonomyReadiness(ticker);
      if (readiness?.status !== "failed") {
        markWeatherTaxonomyFailed(ticker, "missing_provider");
      }
    }
  } catch {
    markWeatherTaxonomyPending(ticker, cycleOrFallbackEtaAt());
  } finally {
    inFlight.delete(ticker);
  }
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    if (yahooRemaining() < YAHOO_HEADROOM) {
      scheduleBudgetRetry();
      break;
    }
    const job = queue.shift();
    if (!job) break;
    queued.delete(job.ticker);
    active += 1;
    refreshPendingEtas();
    void runJob(job.ticker).finally(() => {
      active -= 1;
      refreshPendingEtas();
      pump();
    });
  }
}

/**
 * Mark watch names that still lack GICS mapping as pending until soft hydrate
 * or the next published cycle. Kick a one-shot soft hydrate when the session
 * can still call Yahoo (so Home never sits on a blank countdown).
 */
export function ensureWeatherTaxonomyAwaiting(tickers: string[]): void {
  const needHydrate: string[] = [];
  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) continue;
    if (seededTaxonomyReady(ticker) || hasMappedWeatherTaxonomy(ticker)) {
      const prev = getWeatherTaxonomyReadiness(ticker);
      if (prev?.status !== "ready") markWeatherTaxonomyReady(ticker);
      continue;
    }

    // Alias table may have been fixed since a hard miss — rematerialize from
    // stored Yahoo strings (no new network call) before giving up.
    const cached = getLiveTaxonomy(ticker);
    if (
      cached &&
      (cached.providerSector || cached.providerIndustry) &&
      (!cached.sector || !cached.industry)
    ) {
      setLiveTaxonomyFromFundamentals(ticker, {
        providerSector: cached.providerSector,
        providerIndustry: cached.providerIndustry,
      });
      if (hasMappedWeatherTaxonomy(ticker)) continue;
    }

    const prev = getWeatherTaxonomyReadiness(ticker);
    if (prev?.status === "failed") continue;

    const eta = cycleOrFallbackEtaAt();
    if (prev?.status === "pending") {
      const etaMs = prev.etaAt ? Date.parse(prev.etaAt) : NaN;
      if (!prev.etaAt || !Number.isFinite(etaMs) || etaMs <= Date.now()) {
        setWeatherTaxonomyEta(ticker, eta);
      }
    } else {
      markWeatherTaxonomyPending(ticker, eta);
    }

    if (
      !attempted.has(ticker) &&
      !queued.has(ticker) &&
      !inFlight.has(ticker)
    ) {
      needHydrate.push(ticker);
    }
  }
  if (needHydrate.length > 0) {
    enqueueWeatherTaxonomyHydrate(needHydrate);
  }
}

/**
 * Fire-and-forget Weather taxonomy hydrate for newly added tickers.
 * Never await from scoring / AppState hot paths.
 */
export function enqueueWeatherTaxonomyHydrate(tickers: string[]): void {
  const unique = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ];
  let changed = false;
  for (const ticker of unique) {
    if (seededTaxonomyReady(ticker)) {
      markWeatherTaxonomyReady(ticker);
      continue;
    }
    if (hasMappedWeatherTaxonomy(ticker)) {
      markWeatherTaxonomyReady(ticker);
      continue;
    }
    const tax = getLiveTaxonomy(ticker);
    if (tax?.sector && tax?.industry) {
      markWeatherTaxonomyReady(ticker);
      continue;
    }

    if (queued.has(ticker) || inFlight.has(ticker)) continue;

    attempted.add(ticker);
    queued.add(ticker);
    queue.push({ ticker });
    changed = true;
  }

  if (!changed && queue.length === 0 && inFlight.size === 0) return;

  // Pending first, then soft-queue ETAs by position (setWeatherTaxonomyEta
  // no-ops until status is pending).
  for (let i = 0; i < queue.length; i += 1) {
    markWeatherTaxonomyPending(queue[i].ticker, durableEtaAt(i));
  }
  for (const ticker of inFlight) {
    markWeatherTaxonomyPending(ticker, durableEtaAt(0));
  }
  refreshPendingEtas();
  pump();
}
