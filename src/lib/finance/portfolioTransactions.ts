import type {
  PortfolioTransaction,
  ShareFillEvent,
  StatusType,
  TransactionActionClass,
} from "../../types";

/**
 * Normalize legacy share_fills rows (no `kind`) into PortfolioTransaction.
 * Pure — no scoring / zone math changes.
 */
export function normalizePortfolioTransaction(
  raw: ShareFillEvent | PortfolioTransaction | Record<string, unknown>,
): PortfolioTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === "cash") {
    return raw as PortfolioTransaction;
  }
  // Legacy qty fill or explicit qty
  if (
    typeof row.ticker === "string" &&
    typeof row.portfolioId === "string" &&
    typeof row.deltaShares === "number"
  ) {
    const fill = raw as ShareFillEvent;
    return { ...fill, kind: "qty" };
  }
  return null;
}

export function normalizePortfolioTransactions(
  rows: unknown,
): PortfolioTransaction[] {
  if (!Array.isArray(rows)) return [];
  const out: PortfolioTransaction[] = [];
  for (const row of rows) {
    const normalized = normalizePortfolioTransaction(
      row as ShareFillEvent | PortfolioTransaction,
    );
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Heuristic action class from a qty delta — not Position Size rule evaluation. */
export function classifyQtyAction(input: {
  sharesBefore: number;
  sharesAfter: number;
}): TransactionActionClass {
  const { sharesBefore, sharesAfter } = input;
  if (sharesAfter <= 0 && sharesBefore > 0) return "go_to_cash";
  if (sharesAfter < sharesBefore) return "trim";
  if (sharesAfter > sharesBefore) return "add";
  return "unclassified";
}

export function classifyCashAction(input: {
  cashBefore: number;
  cashAfter: number;
}): TransactionActionClass {
  if (input.cashAfter === input.cashBefore) return "unclassified";
  // Cash edits alone are unclassified until correlated with sells / go-to-cash.
  return "unclassified";
}

/** Collect Layer 3 zone statuses present on a resolved stamp (read-only). */
export function zoneHintsFromStatuses(
  statuses: Array<StatusType | undefined | null>,
): StatusType[] {
  const zones: StatusType[] = ["Trim Zone", "Add Zone", "Go to Cash"];
  const found = new Set<StatusType>();
  for (const status of statuses) {
    if (status && zones.includes(status)) found.add(status);
  }
  return Array.from(found);
}
