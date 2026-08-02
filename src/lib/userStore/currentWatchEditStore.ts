import type { Portfolio, PortfolioTransaction, Strategy } from "../../types";
import { getSupabase } from "../auth/supabaseClient";
import { serializeWorkspaceMutation } from "./workspaceMutationQueue";

export interface CommitCurrentWatchEditInput {
  portfolioId: string;
  expectedRevision: number;
  portfolio: Portfolio;
  strategies: Strategy[];
  transactions: PortfolioTransaction[];
  historyRemovalTickers: string[];
}

export interface CommitCurrentWatchEditResult {
  revision: number;
  historyArchives: Array<{
    ticker: string;
    archiveId: number;
    purgeAt: string;
  }>;
}

export type CurrentWatchCommitFailureReason =
  | "schema-unavailable"
  | "session-expired"
  | "portfolio-not-found"
  | "invalid-math"
  | "invalid-data"
  | "ticker-limit"
  | "permission-denied"
  | "save-unavailable";

export class CurrentWatchCommitError extends Error {
  constructor(
    readonly reason: CurrentWatchCommitFailureReason | "conflict",
  ) {
    super(`CURRENT_WATCH_COMMIT_${reason.toUpperCase().replaceAll("-", "_")}`);
  }
}

export function currentWatchCommitFailureReason(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): CurrentWatchCommitFailureReason | "conflict" {
  const detail = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (detail.includes("portfolio_revision_conflict")) return "conflict";
  if (
    error.code === "PGRST202" ||
    detail.includes("commit_current_watch_edit") &&
      (detail.includes("could not find") || detail.includes("schema cache"))
  ) return "schema-unavailable";
  if (detail.includes("not_authenticated") || detail.includes("jwt expired")) {
    return "session-expired";
  }
  if (detail.includes("portfolio_not_found")) return "portfolio-not-found";
  if (
    detail.includes("invalid_manual_cash_math") ||
    detail.includes("invalid_manual_qty_math") ||
    detail.includes("share_sequence_conflict") ||
    detail.includes("portfolio_projection_mismatch")
  ) return "invalid-math";
  if (detail.includes("ticker_limit_exceeded")) return "ticker-limit";
  if (error.code === "42501" || detail.includes("permission denied")) {
    return "permission-denied";
  }
  if (detail.includes("invalid_")) return "invalid-data";
  return "save-unavailable";
}

export async function commitCurrentWatchEdit(
  input: CommitCurrentWatchEditInput,
  userId: string,
): Promise<CommitCurrentWatchEditResult> {
  return serializeWorkspaceMutation(userId, async () => {
    const { data, error } = await getSupabase().rpc("commit_current_watch_edit", {
      p_portfolio_id: input.portfolioId,
      p_expected_revision: input.expectedRevision,
      p_portfolio: input.portfolio,
      p_strategies: input.strategies,
      p_transactions: input.transactions,
      p_history_removal_tickers: input.historyRemovalTickers,
    });
    if (error) {
      throw new CurrentWatchCommitError(
        currentWatchCommitFailureReason(error),
      );
    }
    const result = data as {
      revision?: number;
      historyArchives?: CommitCurrentWatchEditResult["historyArchives"];
    };
    return {
      revision: Number(result.revision),
      historyArchives: result.historyArchives ?? [],
    };
  });
}
