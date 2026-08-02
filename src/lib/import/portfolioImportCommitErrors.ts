/**
 * Stable, user-safe import commit error contract.
 * Maps authoritative server exception codes to typed client failures without
 * exposing SQL, stack traces, or raw database payloads.
 */

import type { TradeCashTreatment } from "../finance/currentWatchTransactions";

export type PortfolioImportCommitCode =
  | "revision-conflict"
  | "session-expired"
  | "network-unavailable"
  | "schema-update-required"
  | "invalid-transaction"
  | "invalid-date-timezone"
  | "insufficient-cash"
  | "oversell"
  | "duplicate-transaction"
  | "portfolio-cash-mismatch"
  | "holdings-mismatch"
  | "average-cost-mismatch"
  | "ticker-limit"
  | "invalid-batch"
  | "reconstruction-enqueue-failed"
  | "unexpected";

export interface PortfolioImportCommitContext {
  sourceRow?: number;
  ticker?: string;
  transactionType?: string;
  filledAt?: string;
  requiredCash?: number;
  availableCash?: number;
  requiredShares?: number;
  availableShares?: number;
  limit?: number;
  resultingCount?: number;
  referenceId?: string;
}

export class PortfolioImportCommitError extends Error {
  readonly code: PortfolioImportCommitCode;
  readonly context: PortfolioImportCommitContext;
  readonly scope: "row" | "batch";

  constructor(
    code: PortfolioImportCommitCode,
    message: string,
    context: PortfolioImportCommitContext = {},
    scope: "row" | "batch" = context.sourceRow != null ? "row" : "batch",
  ) {
    super(message);
    this.name = "PortfolioImportCommitError";
    this.code = code;
    this.context = context;
    this.scope = scope;
  }
}

const SAFE_DETAIL_KEYS = new Set([
  "code",
  "sourceRow",
  "ticker",
  "transactionType",
  "filledAt",
  "requiredCash",
  "availableCash",
  "requiredShares",
  "availableShares",
  "limit",
  "resultingCount",
]);

function newReferenceId(): string {
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `imp-${Date.now().toString(36)}-${entropy}`;
}

function parseSafeDetail(raw: string | undefined): {
  context: PortfolioImportCommitContext;
  detailCode?: string;
} {
  if (!raw) return { context: {} };
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return { context: {} };
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const context: PortfolioImportCommitContext = {};
    let detailCode: string | undefined;
    for (const [key, value] of Object.entries(parsed)) {
      if (!SAFE_DETAIL_KEYS.has(key)) continue;
      if (key === "code" && typeof value === "string" && value.length <= 64) {
        detailCode = value;
        continue;
      }
      if (key === "sourceRow" || key === "limit" || key === "resultingCount") {
        const number = Number(value);
        if (Number.isFinite(number) && number >= 0) {
          context[key] = Math.trunc(number);
        }
        continue;
      }
      if (
        key === "requiredCash" ||
        key === "availableCash" ||
        key === "requiredShares" ||
        key === "availableShares"
      ) {
        const number = Number(value);
        if (Number.isFinite(number)) context[key] = number;
        continue;
      }
      if (typeof value === "string" && value.length > 0 && value.length <= 64) {
        if (key === "ticker" || key === "transactionType" || key === "filledAt") {
          context[key] = value;
        }
      }
    }
    return { context, detailCode };
  } catch {
    return { context: {} };
  }
}

function sourceRowFromTransactionId(id: string | undefined): number | undefined {
  if (!id) return undefined;
  const match = id.match(/:row:(\d{1,6})$/);
  if (!match) return undefined;
  const row = Number(match[1]);
  return Number.isFinite(row) ? row : undefined;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function withRow(row: number | undefined, sentence: string): string {
  return row != null ? `Row ${row} ${sentence}` : `This transaction ${sentence}`;
}

function formatMessage(
  code: PortfolioImportCommitCode,
  context: PortfolioImportCommitContext,
): string {
  const row = context.sourceRow;
  switch (code) {
    case "revision-conflict":
      return "The portfolio changed after this preview was prepared. We refreshed it; review the updated preview.";
    case "session-expired":
      return "Your session expired before the import could be saved. Sign in again, then retry.";
    case "network-unavailable":
      return "The import service is temporarily unavailable. Check your connection and retry.";
    case "schema-update-required":
      return "The import service needs a database update before this import type can be saved. Your portfolio has not changed.";
    case "invalid-transaction":
      return withRow(
        row,
        "could not be applied because the transaction is incomplete or invalid. Review the row and retry.",
      );
    case "invalid-date-timezone":
      return withRow(
        row,
        "could not be applied because the date, time, or time zone is invalid. Confirm the time zone and retry.",
      );
    case "insufficient-cash": {
      if (row != null && context.requiredCash != null && context.availableCash != null) {
        return `Row ${row} could not be applied because only ${formatUsd(context.availableCash)} was available before this ${formatUsd(context.requiredCash)} purchase. Add a deposit or opening cash earlier in the timeline, or choose preserve-current-cash if that matches your brokerage cash.`;
      }
      return withRow(
        row,
        "could not be applied because cash was insufficient at that point in the timeline. Add a deposit or opening cash before the purchase.",
      );
    }
    case "oversell":
      return withRow(
        row,
        "could not be applied because this sale exceeds the shares held at that point in the timeline.",
      );
    case "duplicate-transaction": {
      const ticker = context.ticker ? ` for ${context.ticker}` : "";
      const when = context.filledAt ? ` at ${context.filledAt}` : "";
      return withRow(
        row,
        `duplicates an existing transaction${ticker}${when}. Remove the duplicate row or exclude it, then retry.`,
      );
    }
    case "portfolio-cash-mismatch":
      return "The saved cash projection no longer matches this import preview. Refresh the portfolio and review the updated preview.";
    case "holdings-mismatch":
      return "The saved holdings projection no longer matches this import preview. Refresh the portfolio and review the updated preview.";
    case "average-cost-mismatch":
      return "The average-cost projection no longer matches this import preview. Refresh the portfolio and review the updated preview.";
    case "ticker-limit":
      return "Adding these holdings would exceed the 40 active-ticker limit. Remove tracked tickers or exclude some import rows, then retry.";
    case "invalid-batch":
      return "This import batch is invalid. Close the import, choose the file again, and retry.";
    case "reconstruction-enqueue-failed":
      return "Historical scoring could not be queued with this import, so nothing was saved. Retry the import. Your portfolio has not changed.";
    case "unexpected":
      // Reference IDs stay in diagnostics/logs — not in the primary user sentence.
      return "The import could not be saved. Your portfolio has not changed. Retry in a moment.";
  }
}

function codeFromServerToken(token: string): PortfolioImportCommitCode | null {
  switch (token) {
    case "portfolio_revision_conflict":
      return "revision-conflict";
    case "not_authenticated":
      return "session-expired";
    case "insufficient_cash":
      return "insufficient-cash";
    case "invalid_cash_math":
      return "insufficient-cash";
    case "invalid_trade_cash_math":
      return "portfolio-cash-mismatch";
    case "stale_cash_sequence":
      return "portfolio-cash-mismatch";
    case "oversell":
      return "oversell";
    case "invalid_share_math":
      return "oversell";
    case "share_sequence_conflict":
      return "oversell";
    case "duplicate_transaction":
      return "duplicate-transaction";
    case "batch_identity_conflict":
      return "duplicate-transaction";
    case "portfolio_cash_mismatch":
      return "portfolio-cash-mismatch";
    case "portfolio_holdings_mismatch":
      return "holdings-mismatch";
    case "invalid_portfolio_holdings":
      return "holdings-mismatch";
    case "portfolio_average_cost_mismatch":
      return "average-cost-mismatch";
    case "ticker_limit_exceeded":
      return "ticker-limit";
    case "invalid_batch":
      return "invalid-batch";
    case "invalid_transaction_count":
      return "invalid-batch";
    case "invalid_replace_basis":
      return "invalid-batch";
    case "invalid_opening_cash":
      return "invalid-batch";
    case "portfolio_mismatch":
      return "invalid-batch";
    case "portfolio_identity_conflict":
      return "invalid-batch";
    case "portfolio_not_found":
      return "invalid-batch";
    case "invalid_qty_transaction":
      return "invalid-transaction";
    case "invalid_cash_transaction":
      return "invalid-transaction";
    case "invalid_transaction":
      return "invalid-transaction";
    case "transaction_precedes_opening_boundary":
      return "invalid-date-timezone";
    case "invalid_opening_boundary":
      return "invalid-date-timezone";
    case "historical_reconstruction_enqueue_failed":
      return "reconstruction-enqueue-failed";
    default:
      return null;
  }
}

function extractServerTokens(detail: string): string[] {
  const matches = detail.match(
    /\b(?:portfolio_[a-z_]+|invalid_[a-z_]+|insufficient_cash|stale_cash_sequence|oversell|not_authenticated|ticker_limit_exceeded|batch_identity_conflict|duplicate_transaction|share_sequence_conflict|historical_reconstruction_enqueue_failed|transaction_precedes_opening_boundary)\b/g,
  );
  return matches ?? [];
}

export function portfolioImportCommitErrorFromUnknown(
  error: unknown,
  options: {
    cashTreatment?: TradeCashTreatment;
    transactionId?: string;
  } = {},
): PortfolioImportCommitError {
  const referenceId = newReferenceId();
  if (error instanceof PortfolioImportCommitError) return error;

  const supabaseLike = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const message = typeof supabaseLike?.message === "string" ? supabaseLike.message : "";
  const details = typeof supabaseLike?.details === "string" ? supabaseLike.details : "";
  const hint = typeof supabaseLike?.hint === "string" ? supabaseLike.hint : "";
  const combined = [message, details, hint].filter(Boolean).join(" ");
  const lower = combined.toLowerCase();
  const fromDetails = parseSafeDetail(details);
  const fromMessage = parseSafeDetail(message);
  const detailContext: PortfolioImportCommitContext = {
    ...fromDetails.context,
    ...fromMessage.context,
  };
  const detailCode = fromDetails.detailCode ?? fromMessage.detailCode;
  if (detailContext.sourceRow == null) {
    detailContext.sourceRow = sourceRowFromTransactionId(options.transactionId);
  }

  if (
    supabaseLike?.code === "PGRST202" ||
    (lower.includes("commit_portfolio_transaction_batch") &&
      (lower.includes("could not find") || lower.includes("schema cache")))
  ) {
    return new PortfolioImportCommitError(
      "schema-update-required",
      formatMessage("schema-update-required", detailContext),
      detailContext,
      "batch",
    );
  }

  if (
    supabaseLike?.code === "23505" ||
    lower.includes("portfolio_transactions_active_fingerprint")
  ) {
    const code = "duplicate-transaction" as const;
    return new PortfolioImportCommitError(
      code,
      formatMessage(code, detailContext),
      detailContext,
    );
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("fetch failed") ||
    supabaseLike?.code === "ENOTFOUND"
  ) {
    return new PortfolioImportCommitError(
      "network-unavailable",
      formatMessage("network-unavailable", detailContext),
      detailContext,
      "batch",
    );
  }

  if (
    lower.includes("historical_reconstruction") &&
    (lower.includes("enqueue") || lower.includes("jobs"))
  ) {
    return new PortfolioImportCommitError(
      "reconstruction-enqueue-failed",
      formatMessage("reconstruction-enqueue-failed", detailContext),
      detailContext,
      "batch",
    );
  }

  for (const token of extractServerTokens(combined)) {
    let code = codeFromServerToken(token);
    if (!code) continue;
    // Preserve-cash commits require the broker cash-treatment migration. The
    // deployed foundations RPC always applies trade cash, so a preserve ledger
    // fails cash math until that migration is applied.
    if (
      (token === "invalid_trade_cash_math" || token === "insufficient_cash") &&
      options.cashTreatment === "preserve"
    ) {
      code = "schema-update-required";
    }
    if (token === "invalid_trade_cash_math" && detailCode === "insufficient_cash") {
      code = "insufficient-cash";
    }
    if (code === "revision-conflict") {
      return new PortfolioImportCommitError(
        code,
        formatMessage(code, detailContext),
        detailContext,
        "batch",
      );
    }
    return new PortfolioImportCommitError(
      code,
      formatMessage(code, detailContext),
      detailContext,
      detailContext.sourceRow != null ? "row" : "batch",
    );
  }

  if (lower.includes("jwt") || lower.includes("not_authenticated")) {
    return new PortfolioImportCommitError(
      "session-expired",
      formatMessage("session-expired", detailContext),
      detailContext,
      "batch",
    );
  }

  if (typeof console !== "undefined") {
    console.warn("portfolio import commit failed", {
      code: "unexpected",
      referenceId,
      supabaseCode: supabaseLike?.code ?? null,
    });
  }
  return new PortfolioImportCommitError(
    "unexpected",
    formatMessage("unexpected", { ...detailContext, referenceId }),
    { ...detailContext, referenceId },
    "batch",
  );
}

export function portfolioImportCommitReassurance(error: PortfolioImportCommitError): string {
  if (error.message.includes("Your portfolio has not changed")) {
    return "";
  }
  return "Your portfolio has not changed.";
}

/** Optional secondary line for unexpected failures — only when a support ref exists. */
export function portfolioImportSupportHint(error: PortfolioImportCommitError): string | null {
  if (error.code !== "unexpected" || !error.context.referenceId) return null;
  return `If this keeps happening, contact support and share reference ${error.context.referenceId}.`;
}
