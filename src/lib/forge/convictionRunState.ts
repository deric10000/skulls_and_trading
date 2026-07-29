/**
 * Presentation model for authoritative conviction check runs.
 * Score Pending is reserved for legitimate waiting/processing work.
 */

export type ConvictionRunDbStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "superseded"
  | "waiting_for_data"
  | "incomplete"
  | "overdue";

export type ConvictionPresentationState =
  | "scheduled"
  | "waiting_for_data"
  | "processing"
  | "retrying"
  | "ready"
  | "stale"
  | "superseded"
  | "failed"
  | "incomplete"
  | "overdue";

export type ConvictionErrorCategory =
  | "symbol_not_registered"
  | "cycle_missing_symbol"
  | "market_data_incomplete"
  | "dispatch_failed"
  | "processing_timeout"
  | "workspace_superseded"
  | "scoring_revision_mismatch"
  | "combined_scope_invalid"
  | "retry_exhausted"
  | "unknown";

export interface ConvictionRunPresentation {
  state: ConvictionPresentationState;
  /** True when the watch face should use Score Pending copy (not a warning). */
  isPendingLike: boolean;
  /** True when a current score may be shown. */
  isReady: boolean;
  label: string;
  tip: string;
  errorCategory?: ConvictionErrorCategory;
  affectedTickers?: string[];
  nextRetryAt?: string | null;
  attemptCount?: number;
}

const PENDING_LIKE: ReadonlySet<ConvictionPresentationState> = new Set([
  "scheduled",
  "waiting_for_data",
  "processing",
  "retrying",
]);

const MAX_RETRY_ATTEMPTS = 5;

export function isSnapshotEligibleRunStatus(
  status: ConvictionRunDbStatus | string | null | undefined,
): boolean {
  return status === "complete";
}

export function categorizeRunError(
  error: string | null | undefined,
): ConvictionErrorCategory {
  const text = (error ?? "").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("symbol_not_registered") || text.includes("not registered")) {
    return "symbol_not_registered";
  }
  if (text.includes("cycle_missing_symbol") || text.includes("missing symbol")) {
    return "cycle_missing_symbol";
  }
  if (text.includes("incomplete") || text.includes("market_data")) {
    return "market_data_incomplete";
  }
  if (text.includes("dispatch")) return "dispatch_failed";
  if (text.includes("timeout")) return "processing_timeout";
  if (text.includes("superseded") || text.includes("workspace")) {
    return "workspace_superseded";
  }
  if (text.includes("scoring_revision") || text.includes("revision mismatch")) {
    return "scoring_revision_mismatch";
  }
  if (text.includes("strategy set") || text.includes("combined")) {
    return "combined_scope_invalid";
  }
  if (text.includes("retry") && text.includes("exhaust")) {
    return "retry_exhausted";
  }
  return "unknown";
}

export function presentConvictionRun(args: {
  dbStatus: ConvictionRunDbStatus | string | null | undefined;
  attemptCount?: number;
  error?: string | null;
  errorCategory?: ConvictionErrorCategory | null;
  affectedTickers?: string[] | null;
  nextRetryAt?: string | null;
  scoreReady: boolean;
  hasHistoricalResult?: boolean;
  scheduledFor?: string | null;
  nowMs?: number;
}): ConvictionRunPresentation {
  if (args.scoreReady) {
    return {
      state: "ready",
      isPendingLike: false,
      isReady: true,
      label: "Current score",
      tip: "Conviction reflects the latest successful check for this scope.",
    };
  }

  const attempts = args.attemptCount ?? 0;
  const category =
    args.errorCategory ?? categorizeRunError(args.error ?? null);
  const affected = args.affectedTickers?.filter(Boolean) ?? [];
  const now = args.nowMs ?? Date.now();
  const scheduledMs = args.scheduledFor
    ? Date.parse(args.scheduledFor)
    : Number.NaN;
  const overdue =
    Number.isFinite(scheduledMs) &&
    scheduledMs < now - 2 * 60 * 60 * 1000 &&
    (args.dbStatus === "pending" || args.dbStatus === "failed");

  let state: ConvictionPresentationState = "scheduled";
  switch (args.dbStatus) {
    case "running":
      state = "processing";
      break;
    case "waiting_for_data":
      state = "waiting_for_data";
      break;
    case "incomplete":
      state = "incomplete";
      break;
    case "superseded":
      state = "superseded";
      break;
    case "overdue":
      state = "overdue";
      break;
    case "failed":
      state =
        attempts >= MAX_RETRY_ATTEMPTS || category === "retry_exhausted"
          ? "failed"
          : "retrying";
      break;
    case "complete":
      state = args.hasHistoricalResult ? "stale" : "scheduled";
      break;
    case "pending":
    default:
      state = overdue ? "overdue" : "scheduled";
      break;
  }

  if (category === "workspace_superseded") state = "superseded";
  if (
    category === "cycle_missing_symbol" ||
    category === "symbol_not_registered" ||
    category === "market_data_incomplete"
  ) {
    if (args.dbStatus === "failed" && attempts >= MAX_RETRY_ATTEMPTS) {
      state = "failed";
    } else if (state === "scheduled" || state === "retrying") {
      state =
        category === "market_data_incomplete"
          ? "incomplete"
          : "waiting_for_data";
    }
  }

  const tickerHint =
    affected.length > 0 ? ` Affected: ${affected.slice(0, 6).join(", ")}.` : "";

  const copy = presentationCopy(state, category, tickerHint, args.nextRetryAt);
  return {
    state,
    isPendingLike: PENDING_LIKE.has(state),
    isReady: false,
    label: copy.label,
    tip: copy.tip,
    errorCategory: category === "unknown" ? undefined : category,
    affectedTickers: affected.length > 0 ? affected : undefined,
    nextRetryAt: args.nextRetryAt ?? null,
    attemptCount: attempts,
  };
}

function presentationCopy(
  state: ConvictionPresentationState,
  category: ConvictionErrorCategory,
  tickerHint: string,
  nextRetryAt?: string | null,
): { label: string; tip: string } {
  switch (state) {
    case "ready":
      return {
        label: "Current score",
        tip: "Conviction reflects the latest successful check for this scope.",
      };
    case "processing":
      return {
        label: "Check in progress",
        tip: "A conviction check is processing for this scope.",
      };
    case "retrying":
      return {
        label: "Retrying check",
        tip: `A prior attempt failed; another try is scheduled.${
          nextRetryAt ? ` Next: ${nextRetryAt}.` : ""
        }${tickerHint}`,
      };
    case "waiting_for_data":
      return {
        label: "Waiting for market data",
        tip: `Required market inputs are not ready yet.${tickerHint}`,
      };
    case "incomplete":
      return {
        label: "Market data incomplete",
        tip: `The latest cycle was missing required inputs for this check.${tickerHint}`,
      };
    case "superseded":
      return {
        label: "Strategy updated",
        tip: "Scoring inputs changed during the last run. A replacement check is scheduled.",
      };
    case "stale":
      return {
        label: "Awaiting updated score",
        tip: "A prior score exists for an older revision and is not current.",
      };
    case "failed":
      return {
        label: "Conviction check failed",
        tip: userSafeFailureTip(category, tickerHint),
      };
    case "overdue":
      return {
        label: "Check overdue",
        tip: `A scheduled conviction check missed its processing window.${tickerHint}`,
      };
    case "scheduled":
    default:
      return {
        label: "Score Pending Next Check",
        tip: "No current score yet. The next scheduled check will publish one when inputs are ready.",
      };
  }
}

function userSafeFailureTip(
  category: ConvictionErrorCategory,
  tickerHint: string,
): string {
  switch (category) {
    case "symbol_not_registered":
    case "cycle_missing_symbol":
      return `This ticker was missing from market collection.${tickerHint} Reconciliation has been requested.`;
    case "market_data_incomplete":
      return `Required market history was incomplete.${tickerHint}`;
    case "dispatch_failed":
      return "The conviction check could not be dispatched. It will retry automatically.";
    case "processing_timeout":
      return "The conviction check timed out and will retry.";
    case "retry_exhausted":
      return `Conviction checks exhausted retries.${tickerHint}`;
    case "scoring_revision_mismatch":
    case "workspace_superseded":
      return "Scoring inputs changed. A fresh check is required.";
    case "combined_scope_invalid":
      return "The strategy set for this ticker changed. A fresh check is required.";
    default:
      return `The conviction check failed.${tickerHint}`;
  }
}

/** Canonical sorted unique strategy IDs for combined-result identity. */
export function canonicalStrategyIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
