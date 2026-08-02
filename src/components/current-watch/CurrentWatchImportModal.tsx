import { useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio, PortfolioTransaction } from "../../types";
import {
  IMPORT_FILE_BYTES,
  replayPortfolioTransactions,
  roundQuantity,
  type DraftPortfolioTransaction,
  type PortfolioOpeningState,
  type TradeCashTreatment,
} from "../../lib/finance/currentWatchTransactions";
import {
  normalizeImportRows,
  portfolioImportTemplateCsv,
  resolveImportDateTime,
  type ImportCell,
  type NormalizeImportResult,
} from "../../lib/import/portfolioImport";
import {
  portfolioImportCommitReassurance,
  portfolioImportSupportHint,
  type PortfolioImportCommitError,
} from "../../lib/import/portfolioImportCommitErrors";
import type { CommitPortfolioBatchInput } from "../../lib/userStore/portfolioLedger";
import { fetchMarketQuotes } from "../../lib/market/client";
import { Dropdown } from "../Dropdown";
import { ForgeTableModal } from "../forge/ForgeTableModal";
import {
  CaretDown,
  CheckCircle,
  Copy,
  DownloadSimple,
  Trash,
  X,
} from "../../lib/icons";
import { Radio } from "../Radio";
import { RowMessage } from "../RowMessage";
import {
  loadLatestHistoricalReconstructionJob,
  type HistoricalReconstructionJobSummary,
} from "../../lib/userStore/historicalReconstructionStore";
import { HistoricalReconstructionToast } from "./HistoricalReconstructionToast";
import {
  IMPORT_IN_APP_ROW_CAP,
  chunkActionLabel,
  nextImportChunk,
  orderDraftTransactionsForImport,
  preparedProgressCopy,
  rebatchDraftForCommit,
  rebatchLedgerForCommit,
  resultingActiveTickerCount,
  usesChunkedAppendImport,
} from "../../lib/import/portfolioImportChunks";
import {
  ImportFlaggedRowsEditor,
  canConfirmFlaggedImportEdits,
  type PendingOversellChoice,
} from "./ImportFlaggedRowsEditor";

type StagedImportChunk = {
  drafts: DraftPortfolioTransaction[];
  ledger: PortfolioTransaction[];
  portfolio: Portfolio;
  from: number;
  to: number;
};

function applyOversellToRow(
  row: DraftPortfolioTransaction,
  resolution: PendingOversellChoice,
): DraftPortfolioTransaction {
  if (resolution.resolution === "close-to-zero") {
    if (resolution.heldShares > 0) {
      return {
        ...row,
        quantity: resolution.heldShares,
        oversellResolution: "close-to-zero",
        oversellPolicy: "clamp-to-held",
        targetSharesAfter: 0,
      };
    }
    return {
      ...row,
      oversellResolution: "close-to-zero",
      oversellPolicy: undefined,
      targetSharesAfter: 0,
    };
  }
  const sharesAfter = resolution.sharesAfter ?? 0;
  if (resolution.heldShares > 0) {
    return {
      ...row,
      quantity: roundQuantity(resolution.heldShares - sharesAfter),
      oversellResolution: "set-qty-left",
      oversellPolicy: undefined,
      targetSharesAfter: sharesAfter,
    };
  }
  return {
    ...row,
    oversellResolution: "set-qty-left",
    oversellPolicy: undefined,
    targetSharesAfter: sharesAfter,
  };
}

const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Phoenix", label: "Arizona Time (MST, no daylight saving)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
  { value: "UTC", label: "UTC" },
];

type ImportMode = "append" | "replace";
type ReplaceBasis = "history" | "opening";

function batchId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `import-${crypto.randomUUID()}`
    : `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function downloadTemplate(): void {
  const url = URL.createObjectURL(
    new Blob([portfolioImportTemplateCsv()], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "portfolio-transaction-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CurrentWatchImportModal({
  portfolio,
  existingTrackedTickers,
  isKnownTicker,
  getMarkPrice,
  onRefreshBase,
  onCancel,
  onCommit,
}: {
  portfolio: Portfolio;
  /** Active (shares > 0) tickers on other portfolios — workspace ticker budget. */
  existingTrackedTickers: string[];
  isKnownTicker: (ticker: string) => boolean;
  getMarkPrice: (ticker: string) => number;
  onRefreshBase: () => Promise<{
    portfolio: Portfolio;
    transactions: PortfolioTransaction[];
  } | null>;
  onCancel: () => void;
  onCommit: (
    input: CommitPortfolioBatchInput,
  ) => Promise<
    | { status: "applied"; revision: number; portfolio: Portfolio }
    | { status: "conflict" }
    | { status: "failed"; error: PortfolioImportCommitError }
  >;
}) {
  const [basePortfolio, setBasePortfolio] = useState(portfolio);
  const [baseTransactions, setBaseTransactions] = useState<PortfolioTransaction[]>([]);
  const [baseReady, setBaseReady] = useState(false);
  const initialRefreshBase = useRef(onRefreshBase);
  const [mode, setMode] = useState<ImportMode | null>(null);
  const [cashTreatment, setCashTreatment] = useState<TradeCashTreatment | null>(null);
  const [replaceBasis, setReplaceBasis] = useState<ReplaceBasis | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<ImportCell[][] | null>(null);
  const [normalized, setNormalized] = useState<NormalizeImportResult | null>(null);
  const [draftTransactions, setDraftTransactions] = useState<
    DraftPortfolioTransaction[]
  >([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [confirmedTimeZone, setConfirmedTimeZone] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [openingAt, setOpeningAt] = useState("");
  const [excludedFlaggedRows, setExcludedFlaggedRows] = useState(false);
  const [pendingOversellById, setPendingOversellById] = useState<
    Record<string, PendingOversellChoice>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorReassurance, setErrorReassurance] = useState<string | null>(null);
  const [supportHint, setSupportHint] = useState<string | null>(null);
  const [commitRowErrors, setCommitRowErrors] = useState<
    Array<{ row: number; message: string }>
  >([]);
  const [status, setStatus] = useState<string | null>(null);
  const [showFileRequirements, setShowFileRequirements] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState(batchId);
  const [importApplied, setImportApplied] = useState(false);
  const [reconstructionStatus, setReconstructionStatus] =
    useState<HistoricalReconstructionJobSummary | null>(null);
  const [dismissedReconstructionId, setDismissedReconstructionId] =
    useState<string | null>(null);
  const refreshedReconstructionIdRef = useRef<string | null>(null);
  const [unsupportedTickers, setUnsupportedTickers] = useState<Set<string>>(
    () => new Set(),
  );
  const [preparedCount, setPreparedCount] = useState(0);
  const [chunksPrepared, setChunksPrepared] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [stagedChunks, setStagedChunks] = useState<StagedImportChunk[]>([]);
  const [stagedBasePortfolio, setStagedBasePortfolio] = useState<Portfolio | null>(
    null,
  );
  const [stagedBaseTransactions, setStagedBaseTransactions] = useState<
    PortfolioTransaction[] | null
  >(null);
  const [chunkStartedAt, setChunkStartedAt] = useState<number | null>(null);
  const [chunkElapsedSec, setChunkElapsedSec] = useState(0);
  const [chunkRangeLabel, setChunkRangeLabel] = useState<string | null>(null);
  const [finishingChunks, setFinishingChunks] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void initialRefreshBase.current()
      .then((base) => {
        if (cancelled) return;
        if (base) {
          setBasePortfolio(base.portfolio);
          setBaseTransactions(base.transactions);
          setBaseReady(true);
        } else {
          setError("The saved portfolio could not be loaded. Close and try again.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("The saved portfolio could not be loaded. Close and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const refresh = async () => {
      const next = await loadLatestHistoricalReconstructionJob(portfolio.id);
      if (cancelled) return;
      setReconstructionStatus(next);
      if (next && ["queued", "running", "retrying"].includes(next.status)) {
        timer = window.setTimeout(() => void refresh(), 30_000);
      } else if (
        next &&
        ["complete", "incomplete", "failed"].includes(next.status) &&
        refreshedReconstructionIdRef.current !== next.id
      ) {
        refreshedReconstructionIdRef.current = next.id;
        await initialRefreshBase.current();
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [importApplied, portfolio.id]);

  useEffect(() => {
    if (chunkStartedAt == null) {
      setChunkElapsedSec(0);
      return;
    }
    const tick = () => {
      setChunkElapsedSec(
        Math.max(0, Math.floor((Date.now() - chunkStartedAt) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [chunkStartedAt]);

  const [tickerValidationUnavailable, setTickerValidationUnavailable] =
    useState(false);
  const [tickerValidationPending, setTickerValidationPending] = useState(false);
  const [tickerValidationRetry, setTickerValidationRetry] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function normalizeRows(
    rows: ImportCell[][],
    zone = confirmedTimeZone,
    targetBatchId = activeBatchId,
  ) {
    const result = normalizeImportRows(rows, {
      batchId: targetBatchId,
      confirmedTimeZone: zone || undefined,
    });
    setNormalized(result);
    setDraftTransactions(result.transactions);
    setExcludedIds(new Set());
    setTickerValidationUnavailable(false);
    setUnsupportedTickers(new Set());
    setExcludedFlaggedRows(false);
  }

  async function chooseFile(nextFile: File | null) {
    setError(null);
    setErrorReassurance(null);
    setSupportHint(null);
    setCommitRowErrors([]);
    setStatus(null);
    setNormalized(null);
    setDraftTransactions([]);
    setExcludedIds(new Set());
    setRawRows(null);
    setUnsupportedTickers(new Set());
    setTickerValidationUnavailable(false);
    setTickerValidationPending(false);
    setExcludedFlaggedRows(false);
    setPreparedCount(0);
    setChunksPrepared(0);
    setStagedChunks([]);
    setStagedBasePortfolio(null);
    setStagedBaseTransactions(null);
    setChunkStartedAt(null);
    setChunkRangeLabel(null);
    setFinishingChunks(false);
    setFile(nextFile);
    const nextBatchId = batchId();
    setActiveBatchId(nextBatchId);
    if (!nextFile) return;
    if (nextFile.size > IMPORT_FILE_BYTES) {
      setError("Choose a CSV or XLSX file no larger than 5 MB.");
      return;
    }
    const extension = nextFile.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "xlsx") {
      setError(
        extension === "numbers"
          ? "Apple Numbers files are not supported. Export the file from Numbers as CSV or Excel (.xlsx), then choose the exported file."
          : "Only CSV and XLSX files are supported. XLS, XLSM, and encrypted files are not accepted.",
      );
      return;
    }
    setBusy(true);
    try {
      const { readPortfolioImportFile } = await import(
        "../../lib/import/importWorkerClient"
      );
      const result = await readPortfolioImportFile(nextFile);
      if (result.sheets.length !== 1 || !result.rows) {
        throw new Error("Choose a file with exactly one worksheet or CSV table.");
      }
      setRawRows(result.rows);
      await normalizeRows(result.rows, confirmedTimeZone, nextBatchId);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "This file could not be read safely.");
    } finally {
      setBusy(false);
    }
  }

  const openingState = useMemo<PortfolioOpeningState | undefined>(() => {
    if (mode === "replace" && replaceBasis === "opening" && openingAt && confirmedTimeZone) {
      const resolved = resolveImportDateTime(openingAt, confirmedTimeZone);
      if (!resolved.iso) return undefined;
      const parsedCash = Number(openingCash);
      if (!Number.isFinite(parsedCash) || parsedCash < 0) return undefined;
      return {
        asOf: resolved.iso,
        timeZone: confirmedTimeZone,
        cash: parsedCash,
        positions: [],
      };
    }
    return undefined;
  }, [mode, replaceBasis, openingAt, confirmedTimeZone, openingCash]);

  const activeDraftTransactions = useMemo(
    () => draftTransactions.filter((row) => !excludedIds.has(row.id)),
    [draftTransactions, excludedIds],
  );

  /** Rows not yet prepared in earlier chunks (keeps flags/duplicates honest). */
  const remainingDraftTransactions = useMemo(() => {
    if (preparedCount <= 0) return activeDraftTransactions;
    return orderDraftTransactionsForImport(activeDraftTransactions).slice(
      preparedCount,
    );
  }, [activeDraftTransactions, preparedCount]);

  const previewBasePortfolio = stagedBasePortfolio ?? basePortfolio;
  const previewBaseTransactions = stagedBaseTransactions ?? baseTransactions;

  const preview = useMemo(() => {
    if (!baseReady || !normalized || !mode) return null;
    if (
      mode === "append" &&
      remainingDraftTransactions.some((transaction) => transaction.ticker) &&
      !cashTreatment
    ) return null;
    const replayBase =
      mode === "replace"
        ? { ...previewBasePortfolio, holdings: [], cashAvailable: 0 }
        : previewBasePortfolio;
    return replayPortfolioTransactions({
      portfolio: replayBase,
      openingState,
      transactions: remainingDraftTransactions,
      existingFingerprints:
        mode === "append"
          ? new Set(
              previewBaseTransactions.flatMap((row) =>
                row.fingerprint ? [row.fingerprint] : [],
              ),
            )
          : new Set(),
      existingTransactions: mode === "append" ? previewBaseTransactions : [],
      markPrice: getMarkPrice,
      tradeCashTreatment: cashTreatment ?? "apply",
    });
  }, [
    normalized,
    mode,
    previewBasePortfolio,
    replaceBasis,
    openingState,
    previewBaseTransactions,
    baseReady,
    getMarkPrice,
    cashTreatment,
    remainingDraftTransactions,
  ]);

  const activePreviewTickers = useMemo(
    () =>
      Array.from(
        new Set(
          (preview?.portfolio.holdings ?? [])
            .filter((holding) => holding.shares > 0)
            .map((holding) => holding.ticker.toUpperCase()),
        ),
      ).sort(),
    [preview],
  );
  const activePreviewTickerKey = activePreviewTickers.join("|");

  useEffect(() => {
    let cancelled = false;
    const unknown = activePreviewTickers.filter(
      (ticker) =>
        !basePortfolio.holdings.some((holding) => holding.ticker === ticker) &&
        !isKnownTicker(ticker),
    );
    if (!normalized || !preview || unknown.length === 0) {
      setTickerValidationPending(false);
      setTickerValidationUnavailable(false);
      setUnsupportedTickers(new Set());
      return () => {
        cancelled = true;
      };
    }
    setTickerValidationPending(true);
    void fetchMarketQuotes(unknown)
      .then((response) => {
        if (cancelled) return;
        if (!response) {
          setTickerValidationUnavailable(true);
          setUnsupportedTickers(new Set());
          return;
        }
        setTickerValidationUnavailable(false);
        setUnsupportedTickers(
          new Set(
            unknown.filter((ticker) => !(response.quotes[ticker]?.lastPrice > 0)),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setTickerValidationPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activePreviewTickerKey,
    tickerValidationRetry,
    normalized,
    preview,
    basePortfolio.holdings,
    isKnownTicker,
  ]);

  const resultingTickerCount = useMemo(() => {
    if (!preview) return 0;
    return resultingActiveTickerCount({
      portfolioId: basePortfolio.id,
      otherPortfolioActiveTickers: existingTrackedTickers,
      resultingHoldings: preview.portfolio.holdings,
    });
  }, [preview, basePortfolio.id, existingTrackedTickers]);
  const tickerLimitExceeded = resultingTickerCount > 40;

  const chunkEligibleTransactions = useMemo(() => {
    if (!preview) return remainingDraftTransactions;
    if (!excludedFlaggedRows) return remainingDraftTransactions;
    const blockedIds = new Set(preview.issues.map((issue) => issue.transactionId));
    return remainingDraftTransactions.filter(
      (row) =>
        !blockedIds.has(row.id) &&
        !(row.ticker && unsupportedTickers.has(row.ticker)),
    );
  }, [
    remainingDraftTransactions,
    excludedFlaggedRows,
    preview,
    unsupportedTickers,
  ]);

  const chunkPlan = useMemo(() => {
    // Remaining drafts already exclude prepared rows; offset stays 0.
    const plan = nextImportChunk(chunkEligibleTransactions, 0, chunksPrepared);
    const inAppTotal = Math.min(
      orderDraftTransactionsForImport(activeDraftTransactions).length,
      IMPORT_IN_APP_ROW_CAP,
    );
    return {
      ...plan,
      inAppTotal,
      remainingInApp: Math.max(0, inAppTotal - preparedCount),
      canImportMore:
        plan.chunk.length > 0 &&
        chunksPrepared < 3 &&
        preparedCount < inAppTotal,
    };
  }, [
    chunkEligibleTransactions,
    chunksPrepared,
    activeDraftTransactions,
    preparedCount,
  ]);

  const chunkedAppend = usesChunkedAppendImport(
    mode,
    normalized?.report.rowsRetained ?? 0,
  );
  const stagedRowCount = stagedChunks.reduce(
    (total, chunk) => total + chunk.drafts.length,
    0,
  );
  const chunkedReadyToFinish =
    chunkedAppend &&
    chunkPlan.inAppTotal > 0 &&
    stagedChunks.length > 0 &&
    savedCount + stagedRowCount >= chunkPlan.inAppTotal;

  const setupBlocked =
    !baseReady ||
    !mode ||
    (mode === "append" &&
      Boolean(activeDraftTransactions.some((row) => row.ticker)) &&
      !cashTreatment) ||
    tickerValidationPending ||
    tickerValidationUnavailable ||
    !normalized ||
    (mode === "replace" && !replaceBasis) ||
    (mode === "replace" &&
      replaceBasis === "opening" &&
      (!openingAt || !confirmedTimeZone || !openingState));
  const normalizationIssues = normalized?.issues.length ?? 0;
  const replayIssues = preview?.issues.length ?? 0;
  const resolvableFlagged =
    normalizationIssues + replayIssues + unsupportedTickers.size;
  const flagged = resolvableFlagged + (tickerLimitExceeded ? 1 : 0);
  const duplicateFlaggedIds = useMemo(() => {
    if (!preview) return [] as string[];
    return preview.issues
      .filter(
        (issue) => issue.code === "duplicate" || issue.code === "overlap",
      )
      .map((issue) => issue.transactionId);
  }, [preview]);

  // Ticker-limit is not bypassed by Exclude All Flagged — that only skips row issues.
  const reviewBlocked =
    (resolvableFlagged > 0 && !excludedFlaggedRows) || tickerLimitExceeded;
  const commitDisabled =
    busy ||
    setupBlocked ||
    !preview ||
    activeDraftTransactions.length === 0 ||
    reviewBlocked ||
    chunkedAppend;
  const chunkStageDisabled =
    busy ||
    finishingChunks ||
    setupBlocked ||
    !preview ||
    !chunkedAppend ||
    reviewBlocked ||
    !chunkPlan.canImportMore ||
    chunkPlan.chunk.length === 0;

  async function refreshAuthoritativeBase(message: string) {
    const refreshed = await onRefreshBase().catch(() => null);
    if (refreshed) {
      setBasePortfolio(refreshed.portfolio);
      setBaseTransactions(refreshed.transactions);
      setActiveBatchId(batchId());
      setError(message);
      setErrorReassurance("Your portfolio has not changed.");
      return true;
    }
    setError(
      "The saved portfolio could not be refreshed. Close and reopen the import to review the latest portfolio.",
    );
    setErrorReassurance("Your portfolio has not changed.");
    return false;
  }

  function partialSaveReassurance(savedThrough: number): string {
    if (savedThrough > 0) {
      return `Saved ${savedThrough} row${savedThrough === 1 ? "" : "s"} earlier in this Finish. Remaining rows were not saved.`;
    }
    return "Your portfolio has not changed.";
  }

  async function commitLedger(
    includedTransactions: DraftPortfolioTransaction[],
    batchIdentity: string,
    commitBase: {
      portfolio: Portfolio;
      transactions: PortfolioTransaction[];
    } = { portfolio: basePortfolio, transactions: baseTransactions },
    options: { savedThrough?: number } = {},
  ) {
    if (!normalized || !mode) {
      return { status: "failed" as const };
    }
    const savedThrough = options.savedThrough ?? 0;
    const rebatchedDrafts = includedTransactions.map((row) =>
      rebatchDraftForCommit(row, batchIdentity),
    );
    const finalPreview = replayPortfolioTransactions({
      portfolio: mode === "replace"
        ? { ...commitBase.portfolio, holdings: [], cashAvailable: 0 }
        : commitBase.portfolio,
      openingState,
      transactions: rebatchedDrafts,
      existingFingerprints:
        mode === "append"
          ? new Set(
              commitBase.transactions.flatMap((row) =>
                row.fingerprint ? [row.fingerprint] : [],
              ),
            )
          : new Set(),
      existingTransactions: mode === "append" ? commitBase.transactions : [],
      markPrice: getMarkPrice,
      tradeCashTreatment: cashTreatment ?? "apply",
    });
    if (finalPreview.issues.length > 0 || finalPreview.ledger.length === 0) {
      if (finalPreview.issues.length > 0) {
        setCommitRowErrors(
          finalPreview.issues.flatMap((issue) =>
            issue.sourceRow != null
              ? [{ row: issue.sourceRow, message: issue.message }]
              : [],
          ),
        );
        setError(
          "This batch could not be saved. Review the flagged rows below, then Finish again.",
        );
      } else {
        setCommitRowErrors([]);
        setError("This batch produced no savable rows.");
      }
      setErrorReassurance(partialSaveReassurance(savedThrough));
      setSupportHint(null);
      return { status: "failed" as const };
    }
    const chunkTickerCount = resultingActiveTickerCount({
      portfolioId: commitBase.portfolio.id,
      otherPortfolioActiveTickers: existingTrackedTickers,
      resultingHoldings: finalPreview.portfolio.holdings,
    });
    if (chunkTickerCount > 40) {
      setError(
        `Adding these holdings would create ${chunkTickerCount} active tickers, above the 40-ticker market-data limit. Remove tracked tickers or exclude some import rows, then retry.`,
      );
      setErrorReassurance(partialSaveReassurance(savedThrough));
      return { status: "failed" as const };
    }
    const result = await onCommit({
      portfolioId: commitBase.portfolio.id,
      expectedRevision: commitBase.portfolio.revision ?? 0,
      portfolio: {
        ...finalPreview.portfolio,
        holdings: finalPreview.portfolio.holdings.filter(
          (holding) => holding.shares > 0,
        ),
      },
      transactions: rebatchLedgerForCommit(finalPreview.ledger, batchIdentity),
      batch: {
        id: batchIdentity,
        mode,
        cashTreatment: mode === "append" ? cashTreatment ?? "apply" : "apply",
        report: {
          ...normalized.report,
          rowsRetained: finalPreview.ledger.length,
        },
        replaceBasis: mode === "replace" ? (replaceBasis ?? undefined) : undefined,
        openingCash: openingState?.cash,
        openingAt: openingState?.asOf,
        openingTimeZone: openingState?.timeZone,
      },
    });
    if (result.status === "conflict") {
      await refreshAuthoritativeBase(
        "The portfolio changed after this preview was prepared. We refreshed it; review the updated preview.",
      );
      return result;
    }
    if (result.status === "failed") {
      const commitError = result.error;
      const stalePreview =
        commitError.code === "portfolio-cash-mismatch" ||
        commitError.code === "holdings-mismatch" ||
        commitError.code === "average-cost-mismatch";
      if (stalePreview) {
        await refreshAuthoritativeBase(commitError.message);
        return result;
      }
      if (commitError.scope === "row" && commitError.context.sourceRow != null) {
        setCommitRowErrors([
          {
            row: commitError.context.sourceRow,
            message: commitError.message,
          },
        ]);
        setError(null);
      } else {
        setError(commitError.message);
      }
      const reassurance = portfolioImportCommitReassurance(commitError);
      setErrorReassurance(
        savedThrough > 0
          ? partialSaveReassurance(savedThrough)
          : reassurance || null,
      );
      setSupportHint(portfolioImportSupportHint(commitError));
      return result;
    }
    return {
      status: "applied" as const,
      preview: finalPreview,
      revision: result.revision,
      portfolio: result.portfolio,
    };
  }

  async function commit() {
    if (commitDisabled || !normalized || !preview || !mode || chunkedAppend) return;
    setBusy(true);
    setError(null);
    setErrorReassurance(null);
    setSupportHint(null);
    setCommitRowErrors([]);
    const blockedIds = new Set(preview.issues.map((issue) => issue.transactionId));
    const includedTransactions = excludedFlaggedRows
      ? activeDraftTransactions.filter(
          (row) =>
            !blockedIds.has(row.id) &&
            !(row.ticker && unsupportedTickers.has(row.ticker)),
        )
      : activeDraftTransactions;
    const result = await commitLedger(includedTransactions, activeBatchId);
    setBusy(false);
    if (result.status === "applied") {
      setFile(null);
      setRawRows(null);
      setImportApplied(true);
      setDismissedReconstructionId(null);
      setReconstructionStatus(
        await loadLatestHistoricalReconstructionJob(portfolio.id),
      );
    }
  }

  /** Prepare the next 100 rows locally — nothing is saved until Finish. */
  async function stageNextChunk() {
    if (chunkStageDisabled || !normalized || !preview || mode !== "append") return;
    const { chunk, inAppTotal } = chunkPlan;
    if (chunk.length === 0) return;
    const from = preparedCount + 1;
    const to = preparedCount + chunk.length;
    setChunkRangeLabel(`${from}–${to}`);
    setChunkStartedAt(Date.now());
    setBusy(true);
    setError(null);
    setErrorReassurance(null);
    setSupportHint(null);
    setCommitRowErrors([]);
    const stageBasePortfolio = stagedBasePortfolio ?? basePortfolio;
    const stageBaseTransactions = stagedBaseTransactions ?? baseTransactions;
    const stagedPreview = replayPortfolioTransactions({
      portfolio: stageBasePortfolio,
      openingState,
      transactions: chunk,
      existingFingerprints: new Set(
        stageBaseTransactions.flatMap((row) =>
          row.fingerprint ? [row.fingerprint] : [],
        ),
      ),
      existingTransactions: stageBaseTransactions,
      markPrice: getMarkPrice,
      tradeCashTreatment: cashTreatment ?? "apply",
    });
    setChunkStartedAt(null);
    setBusy(false);
    if (stagedPreview.issues.length > 0 || stagedPreview.ledger.length === 0) {
      setError("Resolve or explicitly exclude every flagged row before preparing the next batch.");
      setErrorReassurance("Your portfolio has not changed.");
      return;
    }
    const nextPrepared = preparedCount + chunk.length;
    const nextChunks = chunksPrepared + 1;
    setStagedChunks((current) => [
      ...current,
      {
        drafts: chunk,
        ledger: stagedPreview.ledger,
        portfolio: stagedPreview.portfolio,
        from,
        to,
      },
    ]);
    setStagedBasePortfolio(stagedPreview.portfolio);
    setStagedBaseTransactions([
      ...stageBaseTransactions,
      ...stagedPreview.ledger,
    ]);
    setPreparedCount(nextPrepared);
    setChunksPrepared(nextChunks);
    setStatus(
      preparedProgressCopy({
        preparedCount: nextPrepared,
        retainedCount: normalized.report.rowsRetained,
        inAppTotal,
      }),
    );
  }

  /** Persist every prepared chunk, then close. Cancel before Finish saves nothing. */
  async function finishChunkedImport() {
    if (!chunkedReadyToFinish || !normalized || mode !== "append" || finishingChunks) {
      return;
    }
    if (stagedChunks.length === 0) return;
    setFinishingChunks(true);
    setBusy(true);
    setError(null);
    setErrorReassurance(null);
    setSupportHint(null);
    setCommitRowErrors([]);
    // Keep the same progressive book as staging — a mid-Finish server refresh
    // can diverge and falsely flag the next chunk.
    let runningPortfolio = basePortfolio;
    let runningTransactions = baseTransactions;
    let pending = [...stagedChunks];
    let savedThrough = savedCount;
    while (pending.length > 0) {
      const staged = pending[0]!;
      setChunkRangeLabel(`${staged.from}–${staged.to}`);
      setChunkStartedAt(Date.now());
      const chunkBatchId = batchId();
      const result = await commitLedger(
        staged.drafts,
        chunkBatchId,
        {
          portfolio: runningPortfolio,
          transactions: runningTransactions,
        },
        { savedThrough },
      );
      setChunkStartedAt(null);
      if (result.status !== "applied") {
        setStagedChunks(pending);
        setSavedCount(savedThrough);
        setFinishingChunks(false);
        setBusy(false);
        return;
      }
      pending = pending.slice(1);
      savedThrough = staged.to;
      runningPortfolio = {
        ...result.portfolio,
        holdings: result.portfolio.holdings.filter((holding) => holding.shares > 0),
        revision: result.revision,
      };
      runningTransactions = [
        ...runningTransactions,
        ...result.preview.ledger,
      ];
      setBasePortfolio(runningPortfolio);
      setBaseTransactions(runningTransactions);
      setStagedBasePortfolio(runningPortfolio);
      setStagedBaseTransactions(runningTransactions);
      setStagedChunks(pending);
      setSavedCount(savedThrough);
      setStatus(
        `Saved rows ${staged.from}–${staged.to}. ${savedThrough} of ${chunkPlan.inAppTotal} rows saved.`,
      );
    }
    setBusy(false);
    setFinishingChunks(false);
    setStagedChunks([]);
    setStagedBasePortfolio(null);
    setStagedBaseTransactions(null);
    setPreparedCount(0);
    setChunksPrepared(0);
    setSavedCount(0);
    setFile(null);
    setRawRows(null);
    setImportApplied(true);
    setDismissedReconstructionId(null);
    setError(null);
    setErrorReassurance(null);
    setCommitRowErrors([]);
    setReconstructionStatus(
      await loadLatestHistoricalReconstructionJob(portfolio.id),
    );
    void onRefreshBase().catch(() => null);
    onCancel();
  }

  function handleCancel() {
    // Do not abandon an in-flight Finish (some chunks may already be saving).
    if (finishingChunks) return;
    // Unsaved staged chunks are client-only. Rows already saved by Finish stay.
    setStagedChunks([]);
    setStagedBasePortfolio(null);
    setStagedBaseTransactions(null);
    setPreparedCount(0);
    setChunksPrepared(0);
    setSavedCount(0);
    onCancel();
  }

  const hasOtherImportFlags =
    normalizationIssues > 0 ||
    tickerLimitExceeded ||
    unsupportedTickers.size > 0 ||
    commitRowErrors.length > 0;
  const canConfirmEdits = canConfirmFlaggedImportEdits(
    preview?.issues ?? [],
    pendingOversellById,
    hasOtherImportFlags,
  );

  const showFlaggedActions = !importApplied && resolvableFlagged > 0;
  const showChunkActions = !importApplied && chunkedAppend && Boolean(normalized);
  const showImportActionBar = showFlaggedActions || showChunkActions;
  const overallProgressPct =
    chunkPlan.inAppTotal > 0
      ? Math.min(100, Math.round((preparedCount / chunkPlan.inAppTotal) * 100))
      : 0;

  return (
    <ForgeTableModal
      title="Import portfolio transactions"
      titleId="current-watch-import-title"
      onCancel={handleCancel}
      onDone={
        importApplied
          ? onCancel
          : chunkedAppend
            ? () => void finishChunkedImport()
            : () => void commit()
      }
      doneLabel={
        importApplied
          ? "Close"
          : finishingChunks
            ? "Saving…"
            : chunkedAppend
              ? "Finish"
              : busy
                ? "Importing…"
                : "Import"
      }
      doneIcon={
        importApplied || chunkedAppend ? null : undefined
      }
      doneDisabled={
        importApplied
          ? false
          : chunkedAppend
            ? !chunkedReadyToFinish || busy || finishingChunks || reviewBlocked
            : commitDisabled
      }
      stableTabs={Boolean(preview && preview.issues.length > 0)}
      stableTabsTableMin={240}
      intro={importApplied
        ? "Your transactions are saved. Historical scoring continues safely in the background after this window closes."
        : "Your file stays on this device while we prepare the preview. We retain only Transaction Type, Ticker, Quantity, Fill Price, Amount (USD), Date / Time, and Time Zone."}
      actionBar={
        showImportActionBar ? (
          <div className="watch-import-action-bar-inner">
            {showChunkActions ? (
              <div
                className="watch-import-progress"
                role="status"
                aria-live="polite"
              >
                <div className="watch-import-progress-copy">
                  {chunkStartedAt != null && chunkRangeLabel ? (
                    <span>
                      {finishingChunks ? "Saving" : "Preparing"} rows{" "}
                      {chunkRangeLabel}… {chunkElapsedSec}s
                    </span>
                  ) : savedCount > 0 && stagedChunks.length > 0 ? (
                    <span>
                      {savedCount} of {chunkPlan.inAppTotal} rows saved. Finish
                      to save the rest — Cancel keeps saved rows and discards
                      the unsaved batches.
                    </span>
                  ) : preparedCount > 0 ? (
                    <span>
                      {preparedProgressCopy({
                        preparedCount,
                        retainedCount: normalized?.report.rowsRetained ?? 0,
                        inAppTotal: chunkPlan.inAppTotal,
                      })}
                      {chunkedReadyToFinish
                        ? " Finish to save — Cancel discards unsaved batches."
                        : null}
                    </span>
                  ) : (
                    <span>
                      Prepare batches of 100 (up to {IMPORT_IN_APP_ROW_CAP}{" "}
                      rows in-app). Nothing is saved until Finish.
                    </span>
                  )}
                </div>
                <div
                  className="watch-import-progress-track"
                  aria-hidden={chunkStartedAt == null && preparedCount === 0}
                >
                  <div
                    className={
                      chunkStartedAt != null
                        ? "watch-import-progress-bar is-indeterminate"
                        : "watch-import-progress-bar"
                    }
                    style={
                      chunkStartedAt == null
                        ? { width: `${overallProgressPct}%` }
                        : undefined
                    }
                  />
                </div>
              </div>
            ) : null}
            <div className="watch-import-action-bar-buttons">
              {showFlaggedActions ? (
                <>
                  <button
                    type="button"
                    className={
                      excludedFlaggedRows
                        ? "btn btn--small watch-order-action is-active"
                        : "btn btn--small watch-order-action watch-order-action--sell"
                    }
                    disabled={busy}
                    onClick={() => {
                      setPendingOversellById({});
                      setExcludedFlaggedRows((current) => !current);
                    }}
                  >
                    {excludedFlaggedRows ? (
                      <X aria-hidden weight="bold" />
                    ) : (
                      <Trash aria-hidden weight="regular" />
                    )}
                    {excludedFlaggedRows
                      ? "Include All Flagged"
                      : "Exclude All Flagged"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--small watch-order-action watch-order-action--sell"
                    disabled={busy || duplicateFlaggedIds.length === 0}
                    onClick={() => {
                      if (duplicateFlaggedIds.length === 0) return;
                      const duplicateIds = new Set(duplicateFlaggedIds);
                      setExcludedFlaggedRows(false);
                      setPendingOversellById((current) => {
                        let changed = false;
                        const next = { ...current };
                        for (const id of duplicateIds) {
                          if (id in next) {
                            delete next[id];
                            changed = true;
                          }
                        }
                        return changed ? next : current;
                      });
                      setExcludedIds((current) => {
                        const next = new Set(current);
                        for (const id of duplicateIds) next.add(id);
                        return next;
                      });
                    }}
                  >
                    <Copy aria-hidden weight="regular" /> Exclude All Duplicates
                  </button>
                  <button
                    type="button"
                    className="btn btn--small watch-order-action"
                    disabled={!canConfirmEdits || busy}
                    onClick={() => {
                      if (!canConfirmEdits) return;
                      setExcludedFlaggedRows(false);
                      setDraftTransactions((current) =>
                        current.map((row) => {
                          const pending = pendingOversellById[row.id];
                          return pending ? applyOversellToRow(row, pending) : row;
                        }),
                      );
                      setPendingOversellById({});
                    }}
                  >
                    <CheckCircle aria-hidden weight="regular" /> Confirm Edits
                  </button>
                </>
              ) : null}
              {showChunkActions ? (
                <button
                  type="button"
                  className="btn btn--small watch-order-action btn--solid"
                  disabled={chunkStageDisabled}
                  onClick={() => void stageNextChunk()}
                >
                  {chunkActionLabel(chunkPlan.chunk.length)}
                </button>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
    >
      {importApplied ? (
        <div className="watch-import-flow">
          <section className="watch-import-section">
            <p role="status">Import complete. Leave this window open or reopen Import later to check historical-scoring progress.</p>
          </section>
          {reconstructionStatus &&
          reconstructionStatus.id !== dismissedReconstructionId &&
          reconstructionStatus.status !== "superseded" ? (
            <HistoricalReconstructionToast
              job={reconstructionStatus}
              onDismiss={() => setDismissedReconstructionId(reconstructionStatus.id)}
            />
          ) : null}
        </div>
      ) : (
      <div className="watch-import-flow">
        {reconstructionStatus &&
        reconstructionStatus.id !== dismissedReconstructionId &&
        reconstructionStatus.status !== "superseded" ? (
          <HistoricalReconstructionToast
            job={reconstructionStatus}
            onDismiss={() => setDismissedReconstructionId(reconstructionStatus.id)}
          />
        ) : null}
        <section className="watch-import-section" aria-labelledby="import-mode-label">
          <span className="config-label forge-label" id="import-mode-label">Choose how to apply this import</span>
          <div className="watch-import-radio-list" role="radiogroup" aria-labelledby="import-mode-label">
            <button type="button" className="watch-import-radio-row" role="radio" aria-checked={mode === "append"} onClick={() => { setMode("append"); setCashTreatment(null); }}>
              <Radio decorative checked={mode === "append"} />
              <span>Add transactions to current portfolio</span>
            </button>
            <button type="button" className="watch-import-radio-row" role="radio" aria-checked={mode === "replace"} onClick={() => { setMode("replace"); setCashTreatment(null); }}>
              <Radio decorative checked={mode === "replace"} />
              <span>Replace portfolio from import</span>
            </button>
          </div>
          {mode === "replace" ? (
            <div className="forge-toast forge-toast--warning watch-import-warning">
              <div className="forge-toast-body">
                <p><strong>Very destructive:</strong> this replaces current holdings and transaction history. The prior portfolio remains recoverable for 30 days.</p>
                <div className="watch-import-choice-grid">
                  <button type="button" className={replaceBasis === "history" ? "btn btn--small btn--ghost is-active" : "btn btn--small btn--ghost"} onClick={() => setReplaceBasis("history")}>Build from full history</button>
                  <button type="button" className={replaceBasis === "opening" ? "btn btn--small btn--ghost is-active" : "btn btn--small btn--ghost"} onClick={() => setReplaceBasis("opening")}>Start from opening state</button>
                </div>
              </div>
            </div>
          ) : null}
          {mode === "replace" && replaceBasis === "opening" ? (
            <div className="watch-import-opening-grid">
              <label><span className="watch-field-label">Opening cash (USD)</span><input className="input" type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label>
              <label><span className="watch-field-label">Opening date / time</span><input className="input" type="datetime-local" value={openingAt} onChange={(event) => setOpeningAt(event.target.value)} /></label>
              <Dropdown id="opening-time-zone" label="Opening time zone" value={confirmedTimeZone} onChange={setConfirmedTimeZone} options={[{ value: "", label: "Confirm time zone…", disabled: true }, ...TIME_ZONES]} />
              <p className="watch-import-note">Opening positions can be represented as Buy rows at the opening timestamp. A future lot-level workflow can extend this without changing the ledger.</p>
            </div>
          ) : null}
          {mode === "append" ? (
            <div className="watch-import-cash-choice">
              <span className="config-label forge-label" id="import-cash-treatment-label">
                Choose how Buy and Sell orders affect cash
              </span>
              <div className="watch-import-radio-list" role="radiogroup" aria-labelledby="import-cash-treatment-label">
                <button type="button" className="watch-import-radio-row" role="radio" aria-checked={cashTreatment === "apply"} onClick={() => setCashTreatment("apply")}>
                  <Radio decorative checked={cashTreatment === "apply"} />
                  <span>
                    <strong>Apply transaction cash flow</strong>
                    <small>Buys use available cash and sells add proceeds. The import stops if cash would fall below $0.</small>
                  </span>
                </button>
                <button type="button" className="watch-import-radio-row" role="radio" aria-checked={cashTreatment === "preserve"} onClick={() => setCashTreatment("preserve")}>
                  <Radio decorative checked={cashTreatment === "preserve"} />
                  <span>
                    <strong>Keep current cash balance</strong>
                    <small>Buys and sells update holdings and market value without changing current cash. Deposits and withdrawals still apply.</small>
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="watch-import-section">
          <span className="config-label forge-label">Choose one CSV or XLSX file</span>
          <div className={showFileRequirements ? "watch-plan-section is-expanded" : "watch-plan-section"}>
            <button
              type="button"
              className="watch-plan-section-toggle"
              aria-expanded={showFileRequirements}
              aria-controls="watch-import-file-rules"
              onClick={() => setShowFileRequirements((current) => !current)}
            >
              <span className="config-label forge-label">File requirements</span>
              <CaretDown className="watch-plan-section-caret" aria-hidden weight="regular" />
            </button>
            {showFileRequirements ? (
              <div id="watch-import-file-rules" className="watch-plan-section-body">
                <ul className="watch-import-requirements">
                  <li>Amounts are tracked in U.S. dollars (USD) only.</li>
                  <li>
                    File specifications:
                    <ul>
                      <li>Maximum file size: 5 MB.</li>
                      <li>Maximum data rows: 5,000.</li>
                      <li>No more than 40 active tracked tickers after import. Closed historical symbols do not count toward this limit.</li>
                      <li>Exactly one worksheet per XLSX file or one table per CSV file.</li>
                      <li>Apple Numbers files must first be exported as CSV or Excel (.xlsx).</li>
                      <li>No formulas, macros, external links, encrypted files, XLS, or XLSM.</li>
                      <li>Transactions from the prior seven days are queued for historical strategy scoring after import. Older records remain available for later Dashboard analysis but are not scored.</li>
                      <li>Accepted fields include Transaction Type, Ticker, Quantity, Fill Price, Amount (USD; required for deposits and withdrawals), Date / Time, and Time Zone (ET/EST, CT/CST, MT/MST, PT/PST, Alaska, Hawaii, Arizona, or UTC). Broker CSV headings such as Side, Symbol, Filled, Avg Price, Status, and Filled Time are normalized automatically.</li>
                      <li>Do not include names, account numbers, bank or routing details, addresses, or other personal information. Extra columns are stripped before anything is saved; the raw file is never uploaded.</li>
                    </ul>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
          <div className="watch-import-file-picker">
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
            />
            <button type="button" className="btn btn--small btn--ghost" aria-describedby="watch-import-file-name" onClick={() => fileInputRef.current?.click()}>
              Choose file
            </button>
            <span className="watch-import-file-name" id="watch-import-file-name" aria-live="polite">
              {file?.name ?? "No file selected"}
            </span>
            <button type="button" className="btn btn--small btn--link watch-import-download" onClick={downloadTemplate}>
              <DownloadSimple aria-hidden weight="regular" />
              Download template
            </button>
          </div>
          <p className="watch-import-note">
            Using Apple Numbers? Export the completed template as CSV or Excel
            (.xlsx) before choosing the file.
          </p>
        </section>

        {normalized?.requiresTimeZoneConfirmation ? (
          <section className="watch-import-section">
            <span className="config-label forge-label">Confirm time zone</span>
            <div className="watch-import-file-row">
              <Dropdown id="import-time-zone" label="Time zone for ambiguous rows" value={confirmedTimeZone} onChange={setConfirmedTimeZone} options={[{ value: "", label: "Choose time zone…", disabled: true }, ...TIME_ZONES]} />
              <button
                type="button"
                className="btn btn--small btn--solid"
                disabled={busy || !confirmedTimeZone || !rawRows}
                onClick={() => {
                  if (!rawRows) return;
                  setBusy(true);
                  void normalizeRows(rawRows, confirmedTimeZone).finally(() =>
                    setBusy(false),
                  );
                }}
              >
                Apply and review
              </button>
            </div>
          </section>
        ) : null}

        {normalized ? (
          <section className="watch-import-section">
            <span className="config-label forge-label">Sanitized preview</span>
            <div className="watch-import-report" role="status">
              <span>{normalized.report.rowsRetained} retained</span>
              {normalized.report.rowsSkipped > 0 ? <span>{normalized.report.rowsSkipped} unexecuted rows excluded</span> : null}
              <span>{normalized.report.ignoredColumnCount} extra columns stripped</span>
              <span>{normalized.report.normalizedCellCount} values normalized</span>
              <span>{normalized.report.fractionalRowCount} fractional rows</span>
              <span>{activePreviewTickers.length} active tickers</span>
              <span>{flagged} flagged rows</span>
            </div>
            {chunkedAppend ? (
              <RowMessage tone="warning">
                Large import ({normalized.report.rowsRetained} executed rows).
                Use Import next 100 to prepare each batch (up to three /{" "}
                {IMPORT_IN_APP_ROW_CAP} rows in-app), then Finish to save.
                Cancel discards prepared batches without changing your
                portfolio.
                {normalized.report.rowsRetained > IMPORT_IN_APP_ROW_CAP
                  ? ` Rows beyond ${IMPORT_IN_APP_ROW_CAP} must be split outside the app.`
                  : null}
              </RowMessage>
            ) : null}
            {normalized.detectedFormat === "webull" ? (
              <p className="watch-import-note">Webull order format detected. Executed quantities are normalized from Filled, Avg Price, and Filled Time; unrelated columns remain local and are discarded.</p>
            ) : null}
            {preview && preview.issues.length > 0 ? (
              <ImportFlaggedRowsEditor
                transactions={remainingDraftTransactions}
                issues={preview.issues}
                canSuggestPreserveCash={
                  mode === "append" && cashTreatment === "apply"
                }
                pendingOversellById={pendingOversellById}
                onPendingOversellChange={(transactionId, pending) => {
                  setExcludedFlaggedRows(false);
                  setPendingOversellById((current) => {
                    if (pending == null) {
                      if (!(transactionId in current)) return current;
                      const next = { ...current };
                      delete next[transactionId];
                      return next;
                    }
                    return { ...current, [transactionId]: pending };
                  });
                }}
                onChange={(transactionId, patch) => {
                  setExcludedFlaggedRows(false);
                  if (
                    "oversellResolution" in patch &&
                    patch.oversellResolution === undefined
                  ) {
                    setPendingOversellById((current) => {
                      if (!(transactionId in current)) return current;
                      const next = { ...current };
                      delete next[transactionId];
                      return next;
                    });
                  }
                  setDraftTransactions((current) =>
                    current.map((row) =>
                      row.id === transactionId ? { ...row, ...patch } : row,
                    ),
                  );
                }}
                onExclude={(transactionId) => {
                  setExcludedFlaggedRows(false);
                  setPendingOversellById((current) => {
                    if (!(transactionId in current)) return current;
                    const next = { ...current };
                    delete next[transactionId];
                    return next;
                  });
                  setExcludedIds((current) => {
                    const next = new Set(current);
                    next.add(transactionId);
                    return next;
                  });
                }}
                onSwitchToPreserveCash={() => {
                  setExcludedFlaggedRows(false);
                  setCashTreatment("preserve");
                }}
              />
            ) : null}
            {normalizationIssues > 0 ||
            commitRowErrors.length > 0 ||
            tickerLimitExceeded ||
            unsupportedTickers.size > 0 ? (
              <div className="watch-import-issues">
                {[
                  ...normalized.issues.map((issue) => ({
                    row: issue.row,
                    message: issue.message,
                    tone: "warning" as const,
                  })),
                  ...commitRowErrors.map((issue) => ({
                    row: issue.row,
                    message: issue.message,
                    tone: "error" as const,
                  })),
                ]
                  .slice(0, 20)
                  .map((issue, index) => (
                    <div key={`${issue.row}-${index}`} className="watch-import-issue">
                      <span>Row {issue.row || "—"}</span>
                      <RowMessage tone={issue.tone}>{issue.message}</RowMessage>
                    </div>
                  ))}
                {tickerLimitExceeded ? (
                  <div className="watch-import-issue">
                    <span>Budget</span>
                    <RowMessage tone="error">
                      Adding these holdings would create {resultingTickerCount}{" "}
                      active tickers, above the 40-ticker market-data limit.
                      Remove tracked tickers on other portfolios or exclude some
                      import rows, then retry.
                    </RowMessage>
                  </div>
                ) : null}
                {unsupportedTickers.size > 0 ? (
                  <div className="watch-import-issue">
                    <span>Ticker</span>
                    <RowMessage tone="error">
                      No market data was found for {Array.from(unsupportedTickers).join(", ")}. Review the symbols or exclude those rows with the trash action above.
                    </RowMessage>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
        {tickerValidationUnavailable ? (
          <div className="forge-error watch-import-file-row" role="alert">
            <span>Ticker verification is temporarily unavailable. Retry the check.</span>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={busy || !rawRows}
              onClick={() => {
                setTickerValidationRetry((current) => current + 1);
              }}
            >
              Retry ticker check
            </button>
          </div>
        ) : null}
        {status ? <p role="status">{status}</p> : null}
        {error ? (
          <div className="watch-import-batch-error" role="alert">
            <RowMessage tone="error">{error}</RowMessage>
            {errorReassurance ? (
              <RowMessage tone="warning">{errorReassurance}</RowMessage>
            ) : null}
            {supportHint ? (
              <p className="watch-import-support-hint">{supportHint}</p>
            ) : null}
          </div>
        ) : null}
        {!error && errorReassurance && commitRowErrors.length > 0 ? (
          <RowMessage tone="warning">{errorReassurance}</RowMessage>
        ) : null}
      </div>
      )}
    </ForgeTableModal>
  );
}
