import type { Portfolio, PortfolioTransaction } from "../../types";
import type { ImportSanitizationReport } from "../import/portfolioImport";
import { getSupabase } from "../auth/supabaseClient";
import { roundQuantity } from "../finance/currentWatchTransactions";

interface PortfolioTransactionRow {
  id: string;
  portfolio_id: string;
  kind: "qty" | "cash";
  transaction_type: "buy" | "sell" | "deposit" | "withdrawal";
  ticker: string | null;
  quantity: number | string | null;
  fill_price: number | string | null;
  amount: number | string | null;
  filled_at: string;
  time_zone: string;
  source: "manual" | "import";
  import_batch_id: string | null;
  fingerprint: string;
  shares_before: number | string | null;
  shares_after: number | string | null;
  cash_before: number | string | null;
  cash_after: number | string | null;
  action_class: PortfolioTransaction["actionClass"];
  strategy_ids: string[] | null;
  zone_hints: PortfolioTransaction["zoneHints"] | null;
}

function numeric(value: number | string | null): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function transactionFromRow(row: PortfolioTransactionRow): PortfolioTransaction | null {
  if (row.kind === "qty" && row.ticker) {
    return {
      id: row.id,
      kind: "qty",
      portfolioId: row.portfolio_id,
      ticker: row.ticker,
      side: row.transaction_type === "sell" ? "sell" : "buy",
      deltaShares: roundQuantity(numeric(row.quantity)),
      sharesBefore: numeric(row.shares_before),
      sharesAfter: numeric(row.shares_after),
      fillPrice: numeric(row.fill_price),
      filledAt: row.filled_at,
      source: row.source === "import" ? "import" : "mock",
      actionClass: row.action_class,
      strategyIds: row.strategy_ids ?? [],
      zoneHints: row.zone_hints ?? [],
      importBatchId: row.import_batch_id ?? undefined,
      fingerprint: row.fingerprint,
      timeZone: row.time_zone,
    };
  }
  if (row.kind === "cash") {
    const cashBefore = numeric(row.cash_before);
    const cashAfter = numeric(row.cash_after);
    return {
      id: row.id,
      kind: "cash",
      portfolioId: row.portfolio_id,
      cashBefore,
      cashAfter,
      deltaCash: cashAfter - cashBefore,
      filledAt: row.filled_at,
      source: row.source === "import" ? "import" : "mock",
      actionClass: row.action_class,
      strategyIds: row.strategy_ids ?? [],
      zoneHints: row.zone_hints ?? [],
      importBatchId: row.import_batch_id ?? undefined,
      fingerprint: row.fingerprint,
      timeZone: row.time_zone,
    };
  }
  return null;
}

/** Compatibility read: pre-migration environments simply return no normalized rows. */
export async function loadNormalizedPortfolioTransactions(
  userId: string,
): Promise<PortfolioTransaction[]> {
  const { data, error } = await getSupabase()
    .from("portfolio_transactions")
    .select(
      "id,portfolio_id,kind,transaction_type,ticker,quantity,fill_price,amount,filled_at,time_zone,source,import_batch_id,fingerprint,shares_before,shares_after,cash_before,cash_after,action_class,strategy_ids,zone_hints",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("filled_at", { ascending: false });
  if (error) {
    // 42P01 = migration not applied. Keep the branch rollback-compatible.
    if (error.code !== "42P01") console.warn("normalized portfolio ledger fetch failed", error.message);
    return [];
  }
  return ((data ?? []) as PortfolioTransactionRow[])
    .map(transactionFromRow)
    .filter((row): row is PortfolioTransaction => row != null);
}

function dedupeLedger(
  legacy: PortfolioTransaction[],
  normalized: PortfolioTransaction[],
): PortfolioTransaction[] {
  const ids = new Set<string>();
  const fingerprints = new Set<string>();
  const result: PortfolioTransaction[] = [];
  for (const row of [...normalized, ...legacy]) {
    if (ids.has(row.id) || (row.fingerprint && fingerprints.has(row.fingerprint))) continue;
    ids.add(row.id);
    if (row.fingerprint) fingerprints.add(row.fingerprint);
    result.push(row);
  }
  return result.sort((left, right) => Date.parse(right.filledAt) - Date.parse(left.filledAt));
}

export function mergePortfolioLedgers(
  legacy: PortfolioTransaction[],
  normalized: PortfolioTransaction[],
): PortfolioTransaction[] {
  return dedupeLedger(legacy, normalized);
}

export interface CommitPortfolioBatchInput {
  portfolioId: string;
  expectedRevision: number;
  portfolio: Portfolio;
  transactions: PortfolioTransaction[];
  batch: {
    id: string;
    mode: "append" | "replace";
    report: ImportSanitizationReport;
    replaceBasis?: "history" | "opening";
    openingCash?: number;
    openingAt?: string;
    openingTimeZone?: string;
  };
}

export async function commitPortfolioTransactionBatch(
  input: CommitPortfolioBatchInput,
): Promise<number> {
  const { data, error } = await getSupabase().rpc(
    "commit_portfolio_transaction_batch",
    {
      p_portfolio_id: input.portfolioId,
      p_expected_revision: input.expectedRevision,
      p_portfolio: input.portfolio,
      p_transactions: input.transactions,
      p_batch: input.batch,
    },
  );
  if (error) {
    if (error.message.includes("portfolio_revision_conflict")) {
      throw new Error("PORTFOLIO_REVISION_CONFLICT");
    }
    throw new Error("IMPORT_COMMIT_FAILED");
  }
  return Number(data);
}

interface PortfolioArchiveRow {
  id: number;
  portfolio_id: string;
  portfolio_snapshot: {
    portfolio?: Portfolio;
  };
  archived_at: string;
  purge_at: string;
  reason: Portfolio["archiveReason"];
}

export async function loadPortfolioArchives(userId: string): Promise<Portfolio[]> {
  const { data, error } = await getSupabase()
    .from("portfolio_archives")
    .select("id,portfolio_id,portfolio_snapshot,archived_at,purge_at,reason")
    .eq("user_id", userId)
    .is("restored_at", null)
    .is("permanently_deleted_at", null)
    .gt("purge_at", new Date().toISOString())
    .order("archived_at", { ascending: false });
  if (error) {
    if (error.code !== "42P01") console.warn("portfolio archives fetch failed", error.message);
    return [];
  }
  return ((data ?? []) as PortfolioArchiveRow[]).flatMap((row) => {
    const portfolio = row.portfolio_snapshot?.portfolio;
    if (!portfolio || portfolio.id !== row.portfolio_id) return [];
    return [{
      ...portfolio,
      id: `archive:${row.id}`,
      archiveId: row.id,
      sourcePortfolioId: row.portfolio_id,
      archiveReason: row.reason,
      archivedAt: row.archived_at,
      purgeAt: row.purge_at,
    }];
  });
}

export async function archivePortfolioSource(
  portfolioId: string,
  expectedRevision: number,
): Promise<Portfolio> {
  const { data, error } = await getSupabase().rpc("archive_portfolio_source", {
    p_portfolio_id: portfolioId,
    p_expected_revision: expectedRevision,
  });
  if (error) {
    if (error.message.includes("portfolio_revision_conflict")) {
      throw new Error("PORTFOLIO_REVISION_CONFLICT");
    }
    throw new Error("PORTFOLIO_ARCHIVE_FAILED");
  }
  const result = data as {
    archiveId?: number;
    portfolio?: Portfolio;
    reason?: Portfolio["archiveReason"];
    archivedAt?: string;
    purgeAt?: string;
  };
  if (!result.portfolio || !result.archiveId || !result.archivedAt || !result.purgeAt) {
    throw new Error("PORTFOLIO_ARCHIVE_FAILED");
  }
  return {
    ...result.portfolio,
    id: `archive:${result.archiveId}`,
    archiveId: result.archiveId,
    sourcePortfolioId: result.portfolio.id,
    archiveReason: result.reason,
    archivedAt: result.archivedAt,
    purgeAt: result.purgeAt,
  };
}

export interface RestoredPortfolioArchive {
  portfolio: Portfolio;
  appliedStrategyIds: string[];
  sourcePortfolioId: string;
}

export async function restorePortfolioArchive(
  archiveId: number,
): Promise<RestoredPortfolioArchive> {
  const { data, error } = await getSupabase().rpc("restore_portfolio_archive", {
    p_archive_id: archiveId,
  });
  if (error || !data) throw new Error("PORTFOLIO_RESTORE_FAILED");
  const result = data as {
    portfolio?: Portfolio;
    appliedStrategyIds?: string[];
    sourcePortfolioId?: string;
  };
  if (!result.portfolio) throw new Error("PORTFOLIO_RESTORE_FAILED");
  return {
    portfolio: result.portfolio,
    appliedStrategyIds: result.appliedStrategyIds ?? [],
    sourcePortfolioId: result.sourcePortfolioId ?? result.portfolio.id,
  };
}

export async function deletePortfolioArchivePermanently(
  archiveId: number,
): Promise<void> {
  const { error } = await getSupabase().rpc("delete_portfolio_archive_permanently", {
    p_archive_id: archiveId,
  });
  if (error) throw new Error("PORTFOLIO_DELETE_FAILED");
}

export interface TickerHistoryArchiveResult {
  archiveId: number;
  purgeAt: string;
}

export async function archivePortfolioTickerHistory(
  portfolioId: string,
  ticker: string,
): Promise<TickerHistoryArchiveResult> {
  const { data, error } = await getSupabase().rpc(
    "archive_portfolio_ticker_history",
    { p_portfolio_id: portfolioId, p_ticker: ticker },
  );
  if (error || !data) throw new Error("TICKER_HISTORY_ARCHIVE_FAILED");
  return data as TickerHistoryArchiveResult;
}

export async function restorePortfolioTickerHistory(archiveId: number): Promise<void> {
  const { error } = await getSupabase().rpc("restore_portfolio_ticker_history", {
    p_archive_id: archiveId,
  });
  if (error) throw new Error("TICKER_HISTORY_RESTORE_FAILED");
}
