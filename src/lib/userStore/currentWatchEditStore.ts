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
      if (error.message.includes("portfolio_revision_conflict")) {
        throw new Error("PORTFOLIO_REVISION_CONFLICT");
      }
      throw new Error("CURRENT_WATCH_COMMIT_FAILED");
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
