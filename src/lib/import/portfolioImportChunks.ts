import type { DraftPortfolioTransaction } from "../finance/currentWatchTransactions";
import type { PortfolioTransaction } from "../../types";

/** Rows committed per in-app chunked append click. */
export const IMPORT_CHUNK_SIZE = 100;
/** Maximum rows importable via in-app chunking (3 × chunk size). */
export const IMPORT_IN_APP_ROW_CAP = IMPORT_CHUNK_SIZE * 3;
/** Append previews above this retained count use the chunked path. */
export const IMPORT_CHUNK_THRESHOLD = IMPORT_CHUNK_SIZE;

export function orderDraftTransactionsForImport(
  transactions: DraftPortfolioTransaction[],
): DraftPortfolioTransaction[] {
  return [...transactions].sort((left, right) => {
    const time = Date.parse(left.filledAt) - Date.parse(right.filledAt);
    return time || (left.sourceRow ?? 0) - (right.sourceRow ?? 0);
  });
}

/**
 * Chronological eligible drafts capped at the in-app row ceiling.
 * `importedCount` skips rows already committed in earlier chunks.
 */
export function inAppEligibleDrafts(
  transactions: DraftPortfolioTransaction[],
  importedCount = 0,
): DraftPortfolioTransaction[] {
  const ordered = orderDraftTransactionsForImport(transactions);
  const capped = ordered.slice(0, IMPORT_IN_APP_ROW_CAP);
  return capped.slice(Math.max(0, importedCount));
}

export function nextImportChunk(
  transactions: DraftPortfolioTransaction[],
  importedCount: number,
  chunksCompleted: number,
): {
  chunk: DraftPortfolioTransaction[];
  inAppTotal: number;
  remainingInApp: number;
  chunksRemaining: number;
  canImportMore: boolean;
} {
  const ordered = orderDraftTransactionsForImport(transactions);
  const inAppTotal = Math.min(ordered.length, IMPORT_IN_APP_ROW_CAP);
  const remainingInApp = Math.max(0, inAppTotal - importedCount);
  const chunksRemaining = Math.max(0, 3 - chunksCompleted);
  const canImportMore =
    remainingInApp > 0 && chunksRemaining > 0 && chunksCompleted < 3;
  const chunk = canImportMore
    ? ordered.slice(importedCount, importedCount + IMPORT_CHUNK_SIZE)
    : [];
  return {
    chunk,
    inAppTotal,
    remainingInApp,
    chunksRemaining,
    canImportMore,
  };
}

export function importProgressCopy(options: {
  importedCount: number;
  retainedCount: number;
  inAppTotal: number;
}): string {
  const { importedCount, retainedCount, inAppTotal } = options;
  if (retainedCount > IMPORT_IN_APP_ROW_CAP) {
    return `${importedCount} of first ${inAppTotal} in-app rows imported`;
  }
  return `${importedCount} of ${inAppTotal} rows imported`;
}

export function chunkActionLabel(chunkLength: number): string {
  if (chunkLength <= 0) return "Import next 100";
  if (chunkLength >= IMPORT_CHUNK_SIZE) return "Import next 100";
  return `Import remaining ${chunkLength}`;
}

export function usesChunkedAppendImport(
  mode: "append" | "replace" | null,
  retainedCount: number,
): boolean {
  return mode === "append" && retainedCount > IMPORT_CHUNK_THRESHOLD;
}

/** Server requires `batchId:row:N` ids to match the batch being committed. */
export function rebatchDraftForCommit(
  draft: DraftPortfolioTransaction,
  batchIdentity: string,
): DraftPortfolioTransaction {
  const sourceRow = draft.sourceRow ?? 0;
  return {
    ...draft,
    id: `${batchIdentity}:row:${sourceRow}`,
    importBatchId: batchIdentity,
  };
}

export function rebatchLedgerForCommit(
  ledger: PortfolioTransaction[],
  batchIdentity: string,
): PortfolioTransaction[] {
  return ledger.map((row) => {
    const fromId = row.id.match(/:row:(\d{1,6})$/);
    const sourceRow = fromId ? Number(fromId[1]) : 0;
    return {
      ...row,
      id: `${batchIdentity}:row:${sourceRow}`,
      importBatchId: batchIdentity,
    };
  });
}

export function preparedProgressCopy(options: {
  preparedCount: number;
  retainedCount: number;
  inAppTotal: number;
}): string {
  const { preparedCount, retainedCount, inAppTotal } = options;
  if (retainedCount > IMPORT_IN_APP_ROW_CAP) {
    return `${preparedCount} of first ${inAppTotal} in-app rows ready`;
  }
  return `${preparedCount} of ${inAppTotal} rows ready`;
}

/** Workspace-wide distinct tickers with shares > 0 after this import lands. */
export function resultingActiveTickerCount(options: {
  portfolioId: string;
  /** Tickers with shares > 0 on other portfolios (not the import target). */
  otherPortfolioActiveTickers: string[];
  /** Holdings on the resulting preview portfolio. */
  resultingHoldings: Array<{ ticker: string; shares: number }>;
}): number {
  const tickers = new Set<string>();
  for (const ticker of options.otherPortfolioActiveTickers) {
    const normalized = ticker.trim().toUpperCase();
    if (normalized) tickers.add(normalized);
  }
  for (const holding of options.resultingHoldings) {
    if (holding.shares > 0) {
      const normalized = holding.ticker.trim().toUpperCase();
      if (normalized) tickers.add(normalized);
    }
  }
  return tickers.size;
}
