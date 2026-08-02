import type {
  Portfolio,
  PortfolioHolding,
  PortfolioTransaction,
  QtySide,
} from "../../types";
import { nextAverageCost, openPnlPercent } from "./averageCost";
import { classifyCashAction, classifyQtyAction } from "./portfolioTransactions";

export const QUANTITY_DECIMALS = 6;
export const IMPORT_ROW_LIMIT = 5_000;
export const IMPORT_TICKER_LIMIT = 40;
export const IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type DraftTransactionType = "buy" | "sell" | "deposit" | "withdrawal";
export type TradeCashTreatment = "apply" | "preserve";

export type OversellPolicy = "clamp-to-held";
/** Explicit import resolution when a sell exceeds accounted shares. */
export type OversellResolution = "close-to-zero" | "set-qty-left";

export interface DraftPortfolioTransaction {
  id: string;
  type: DraftTransactionType;
  ticker?: string;
  quantity?: number;
  fillPrice?: number;
  amount?: number;
  filledAt: string;
  timeZone: string;
  source: "manual" | "import";
  importBatchId?: string;
  sourceRow?: number;
  /**
   * When a sell exceeds shares accounted for in this portfolio timeline,
   * clamp the sale to the held quantity so the position ends at 0.
   * Does not invent untracked shares — server share sequencing stays honest.
   */
  oversellPolicy?: OversellPolicy;
  /** User-chosen oversell fix from the import flagged-row radios. */
  oversellResolution?: OversellResolution;
  /** Target shares after sell when oversellResolution is set-qty-left. */
  targetSharesAfter?: number;
}

export interface OpeningPosition {
  ticker: string;
  quantity: number;
  averageCost: number;
}

export interface PortfolioOpeningState {
  asOf: string;
  timeZone: string;
  cash: number;
  positions: OpeningPosition[];
}

export type TransactionIssueCode =
  | "invalid-date"
  | "invalid-ticker"
  | "invalid-quantity"
  | "invalid-price"
  | "invalid-amount"
  | "insufficient-cash"
  | "oversell"
  | "duplicate"
  | "overlap";

export interface TransactionIssue {
  transactionId: string;
  sourceRow?: number;
  code: TransactionIssueCode;
  message: string;
  ticker?: string;
  availableShares?: number;
  requiredShares?: number;
  availableCash?: number;
  requiredCash?: number;
}

export interface ReplayOptions {
  portfolio: Portfolio;
  transactions: DraftPortfolioTransaction[];
  openingState?: PortfolioOpeningState;
  existingFingerprints?: ReadonlySet<string>;
  existingTransactions?: PortfolioTransaction[];
  markPrice?: (ticker: string) => number;
  /** Whether imported buy/sell cash flow changes the portfolio's current cash. */
  tradeCashTreatment?: TradeCashTreatment;
}

export interface ReplayResult {
  portfolio: Portfolio;
  ledger: PortfolioTransaction[];
  issues: TransactionIssue[];
  validTransactionIds: string[];
}

const quantityScale = 10 ** QUANTITY_DECIMALS;

export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * quantityScale) / quantityScale;
}

export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatQuantity(value: number): string {
  return roundQuantity(value).toFixed(QUANTITY_DECIMALS).replace(/\.?0+$/, "");
}

/** Fractional edit fields show five decimals, retaining a meaningful sixth. */
export function formatFractionalQuantityInput(value: number): string {
  const fixed = roundQuantity(value).toFixed(QUANTITY_DECIMALS);
  return fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
}

export function transactionFingerprint(
  portfolioId: string,
  transaction: Pick<
    DraftPortfolioTransaction,
    "type" | "ticker" | "quantity" | "fillPrice" | "amount" | "filledAt"
  >,
): string {
  return [
    portfolioId,
    transaction.type,
    transaction.ticker?.trim().toUpperCase() ?? "",
    formatQuantity(transaction.quantity ?? 0),
    roundUsd(transaction.fillPrice ?? 0).toFixed(2),
    roundUsd(transaction.amount ?? 0).toFixed(2),
    new Date(transaction.filledAt).toISOString(),
  ].join("|");
}

function copyHolding(holding: PortfolioHolding): PortfolioHolding {
  return { ...holding, strategyIds: [...holding.strategyIds] };
}

function newHolding(ticker: string, strategyIds: string[]): PortfolioHolding {
  return {
    ticker,
    shares: 0,
    avgPrice: 0,
    openPnlPct: 0,
    conviction: 0,
    status: "No Strategy",
    reason: "Pending the next strategy check.",
    strategyIds: [...strategyIds],
  };
}

function issue(
  transaction: DraftPortfolioTransaction,
  code: TransactionIssueCode,
  message: string,
  extra: Partial<
    Pick<
      TransactionIssue,
      | "ticker"
      | "availableShares"
      | "requiredShares"
      | "availableCash"
      | "requiredCash"
    >
  > = {},
): TransactionIssue {
  return {
    transactionId: transaction.id,
    sourceRow: transaction.sourceRow,
    code,
    message,
    ...extra,
  };
}

/**
 * Chronological, all-or-none preview engine for manual and imported activity.
 * It never mutates its inputs and never silently drops an invalid row.
 */
export function replayPortfolioTransactions(options: ReplayOptions): ReplayResult {
  const { portfolio, openingState, existingFingerprints = new Set() } = options;
  const tradeCashTreatment = options.tradeCashTreatment ?? "apply";
  const startingHoldings = openingState
    ? openingState.positions.map((position) => ({
        ...newHolding(position.ticker.trim().toUpperCase(), []),
        shares: roundQuantity(position.quantity),
        avgPrice: roundUsd(position.averageCost),
      }))
    : portfolio.holdings.map(copyHolding);
  const holdings = new Map(startingHoldings.map((holding) => [holding.ticker, holding]));
  let cash = roundUsd(openingState?.cash ?? portfolio.cashAvailable ?? 0);
  const ledger: PortfolioTransaction[] = [];
  const issues: TransactionIssue[] = [];
  const validTransactionIds: string[] = [];
  const batchFingerprints = new Set<string>();
  const overlapKeys = new Set(
    (options.existingTransactions ?? []).map((row) =>
      [
        row.kind === "qty" ? row.side : row.deltaCash > 0 ? "deposit" : "withdrawal",
        row.kind === "qty" ? row.ticker : "CASH",
        new Date(row.filledAt).toISOString(),
      ].join("|"),
    ),
  );

  const ordered = [...options.transactions].sort((left, right) => {
    const time = Date.parse(left.filledAt) - Date.parse(right.filledAt);
    return time || (left.sourceRow ?? 0) - (right.sourceRow ?? 0);
  });

  for (const transaction of ordered) {
    if (Number.isNaN(Date.parse(transaction.filledAt))) {
      issues.push(issue(transaction, "invalid-date", "Review the date, time, and time zone."));
      continue;
    }
    const fingerprint = transactionFingerprint(portfolio.id, transaction);
    if (existingFingerprints.has(fingerprint) || batchFingerprints.has(fingerprint)) {
      issues.push(issue(transaction, "duplicate", "This appears to duplicate another transaction."));
      continue;
    }
    batchFingerprints.add(fingerprint);
    const overlapKey = [
      transaction.type,
      transaction.ticker?.trim().toUpperCase() || "CASH",
      new Date(transaction.filledAt).toISOString(),
    ].join("|");
    if (overlapKeys.has(overlapKey)) {
      issues.push(
        issue(
          transaction,
          "overlap",
          "A transaction of this type already exists at the same time. Review it for overlap.",
        ),
      );
      continue;
    }
    overlapKeys.add(overlapKey);

    if (transaction.type === "deposit" || transaction.type === "withdrawal") {
      const amount = roundUsd(transaction.amount ?? 0);
      if (!(amount > 0)) {
        issues.push(issue(transaction, "invalid-amount", "Enter a USD amount greater than zero."));
        continue;
      }
      const cashBefore = cash;
      const cashAfter = roundUsd(
        transaction.type === "deposit" ? cashBefore + amount : cashBefore - amount,
      );
      if (cashAfter < 0) {
        issues.push(issue(transaction, "insufficient-cash", "This withdrawal exceeds available cash at that point in the timeline."));
        continue;
      }
      cash = cashAfter;
      ledger.push({
        id: transaction.id,
        kind: "cash",
        portfolioId: portfolio.id,
        cashBefore,
        cashAfter,
        deltaCash: roundUsd(cashAfter - cashBefore),
        filledAt: transaction.filledAt,
        source: transaction.source === "import" ? "import" : "mock",
        actionClass: classifyCashAction({ cashBefore, cashAfter }),
        importBatchId: transaction.importBatchId,
        fingerprint,
        timeZone: transaction.timeZone,
      });
      validTransactionIds.push(transaction.id);
      continue;
    }

    const ticker = transaction.ticker?.trim().toUpperCase() ?? "";
    let quantity = roundQuantity(transaction.quantity ?? 0);
    const fillPrice = roundUsd(transaction.fillPrice ?? 0);
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      issues.push(issue(transaction, "invalid-ticker", "Review this ticker symbol."));
      continue;
    }
    if (!(quantity > 0)) {
      issues.push(issue(transaction, "invalid-quantity", "Enter a quantity greater than zero."));
      continue;
    }
    if (!(fillPrice > 0)) {
      issues.push(issue(transaction, "invalid-price", "Enter a fill price greater than zero."));
      continue;
    }

    let current = holdings.get(ticker) ?? newHolding(ticker, []);
    const side: QtySide = transaction.type;
    let untrackedClose = false;
    if (side === "sell" && quantity > current.shares) {
      const held = current.shares;
      if (transaction.oversellResolution === "close-to-zero") {
        if (held > 0) {
          quantity = held;
        } else {
          // Brokerage-held / missing earlier buys: treat sale as closing an
          // untracked lot equal to the sold quantity, ending at 0.
          untrackedClose = true;
          current = {
            ...current,
            ticker,
            shares: quantity,
            avgPrice: fillPrice,
          };
          holdings.set(ticker, current);
        }
      } else if (
        transaction.oversellResolution === "set-qty-left" &&
        transaction.targetSharesAfter != null
      ) {
        const sharesAfterTarget = roundQuantity(transaction.targetSharesAfter);
        if (held > 0) {
          if (sharesAfterTarget >= 0 && sharesAfterTarget < held) {
            quantity = roundQuantity(held - sharesAfterTarget);
          } else {
            issues.push(
              issue(
                transaction,
                "oversell",
                `Choose a total qty left from 0 up to (but not including) ${formatQuantity(held)}, or close the accounted position to 0.`,
                {
                  ticker,
                  availableShares: held,
                  requiredShares: quantity,
                },
              ),
            );
            continue;
          }
        } else if (sharesAfterTarget >= 0) {
          untrackedClose = true;
          const sharesBeforeUntracked = roundQuantity(quantity + sharesAfterTarget);
          current = {
            ...current,
            ticker,
            shares: sharesBeforeUntracked,
            avgPrice: fillPrice,
          };
          holdings.set(ticker, current);
        } else {
          issues.push(
            issue(
              transaction,
              "oversell",
              `Choose a total qty left of 0 or more for this untracked ${ticker} sell, or close it to 0.`,
              {
                ticker,
                availableShares: held,
                requiredShares: quantity,
              },
            ),
          );
          continue;
        }
      } else if (transaction.oversellPolicy === "clamp-to-held" && held > 0) {
        quantity = held;
      } else {
        issues.push(
          issue(
            transaction,
            "oversell",
            held > 0
              ? `This ${ticker} sale of ${formatQuantity(quantity)} exceeds the ${formatQuantity(held)} shares held in this portfolio at that point in the timeline.`
              : `This ${ticker} sale exceeds shares held in this portfolio at that point in the timeline. No ${ticker} shares are accounted for yet.`,
            {
              ticker,
              availableShares: held,
              requiredShares: quantity,
            },
          ),
        );
        continue;
      }
    }
    const tradeValue = roundUsd(quantity * fillPrice);
    if (tradeCashTreatment === "apply" && side === "buy" && tradeValue > cash) {
      issues.push(
        issue(
          transaction,
          "insufficient-cash",
          `Add a deposit or opening cash before this ${ticker} purchase.`,
          {
            ticker,
            availableCash: cash,
            requiredCash: tradeValue,
          },
        ),
      );
      continue;
    }
    const sharesBefore = current.shares;
    const sharesAfter = roundQuantity(
      side === "buy" ? sharesBefore + quantity : sharesBefore - quantity,
    );
    const cashBefore = cash;
    if (tradeCashTreatment === "apply") {
      cash = roundUsd(side === "buy" ? cash - tradeValue : cash + tradeValue);
    }
    const avgPrice = nextAverageCost({
      sharesBefore,
      avgBefore: current.avgPrice,
      side,
      deltaShares: quantity,
      fillPrice,
      sharesAfter,
    });
    const mark = options.markPrice?.(ticker) ?? 0;
    holdings.set(ticker, {
      ...current,
      ticker,
      shares: sharesAfter,
      avgPrice,
      openPnlPct: openPnlPercent(mark, avgPrice),
    });
    ledger.push({
      id: transaction.id,
      kind: "qty",
      portfolioId: portfolio.id,
      ticker,
      side,
      deltaShares: quantity,
      sharesBefore,
      sharesAfter,
      fillPrice,
      filledAt: transaction.filledAt,
      source: transaction.source === "import" ? "import" : "mock",
      actionClass: classifyQtyAction({ sharesBefore, sharesAfter }),
      // Imported history predates reconstruction, so it cannot inherit the
      // portfolio's present-day strategy attribution.
      strategyIds:
        transaction.source === "import" ? [] : [...current.strategyIds],
      importBatchId: transaction.importBatchId,
      fingerprint,
      timeZone: transaction.timeZone,
      cashBefore,
      cashAfter: cash,
      ...(untrackedClose ? { untrackedClose: true } : {}),
    });
    validTransactionIds.push(transaction.id);
  }

  return {
    portfolio: {
      ...portfolio,
      holdings: [...holdings.values()],
      cashAvailable: cash,
      revision: (portfolio.revision ?? 0) + 1,
    },
    ledger,
    issues,
    validTransactionIds,
  };
}
