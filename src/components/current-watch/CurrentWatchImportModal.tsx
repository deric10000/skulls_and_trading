import { useEffect, useMemo, useRef, useState } from "react";
import type { Portfolio, PortfolioTransaction } from "../../types";
import {
  IMPORT_FILE_BYTES,
  replayPortfolioTransactions,
  type PortfolioOpeningState,
} from "../../lib/finance/currentWatchTransactions";
import {
  normalizeImportRows,
  portfolioImportTemplateCsv,
  resolveImportDateTime,
  type ImportCell,
  type NormalizeImportResult,
} from "../../lib/import/portfolioImport";
import type { CommitPortfolioBatchInput } from "../../lib/userStore/portfolioLedger";
import { fetchMarketQuotes } from "../../lib/market/client";
import { Dropdown } from "../Dropdown";
import { ForgeTableModal } from "../forge/ForgeTableModal";
import { CaretDown, DownloadSimple, Plus, X } from "../../lib/icons";
import { Radio } from "../Radio";

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
  existingTransactions,
  existingTrackedTickers,
  isKnownTicker,
  getMarkPrice,
  onRefreshBase,
  onCancel,
  onCommit,
}: {
  portfolio: Portfolio;
  existingTransactions: PortfolioTransaction[];
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
  ) => Promise<"applied" | "conflict" | "failed">;
}) {
  const [basePortfolio, setBasePortfolio] = useState(portfolio);
  const [baseTransactions, setBaseTransactions] = useState(existingTransactions);
  const [baseReady, setBaseReady] = useState(false);
  const initialRefreshBase = useRef(onRefreshBase);
  const [mode, setMode] = useState<ImportMode | null>(null);
  const [replaceBasis, setReplaceBasis] = useState<ReplaceBasis | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<ImportCell[][] | null>(null);
  const [normalized, setNormalized] = useState<NormalizeImportResult | null>(null);
  const [confirmedTimeZone, setConfirmedTimeZone] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [openingAt, setOpeningAt] = useState("");
  const [excludedFlaggedRows, setExcludedFlaggedRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showFileRequirements, setShowFileRequirements] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState(batchId);
  const [unsupportedTickers, setUnsupportedTickers] = useState<Set<string>>(
    () => new Set(),
  );

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
  const [tickerValidationUnavailable, setTickerValidationUnavailable] =
    useState(false);
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
    const tickers = Array.from(
      new Set(result.transactions.flatMap((row) => (row.ticker ? [row.ticker] : []))),
    );
    const unknown = tickers.filter(
      (ticker) =>
        !basePortfolio.holdings.some((holding) => holding.ticker === ticker) &&
        !isKnownTicker(ticker),
    );
    if (unknown.length > 0) {
      const response = await fetchMarketQuotes(unknown);
      if (!response) {
        setTickerValidationUnavailable(true);
        setUnsupportedTickers(new Set());
        return;
      }
      setTickerValidationUnavailable(false);
      setUnsupportedTickers(
        new Set(
          unknown.filter(
            (ticker) => !(response?.quotes[ticker]?.lastPrice > 0),
          ),
        ),
      );
    } else {
      setTickerValidationUnavailable(false);
      setUnsupportedTickers(new Set());
    }
    setExcludedFlaggedRows(false);
  }

  async function chooseFile(nextFile: File | null) {
    setError(null);
    setStatus(null);
    setNormalized(null);
    setRawRows(null);
    setUnsupportedTickers(new Set());
    setTickerValidationUnavailable(false);
    setExcludedFlaggedRows(false);
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
      setError("Only CSV and XLSX files are supported. XLS, XLSM, and encrypted files are not accepted.");
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

  const preview = useMemo(() => {
    if (!baseReady || !normalized || !mode) return null;
    const replayBase =
      mode === "replace"
        ? { ...basePortfolio, holdings: [], cashAvailable: 0 }
        : basePortfolio;
    return replayPortfolioTransactions({
      portfolio: replayBase,
      openingState,
      transactions: normalized.transactions,
      existingFingerprints:
        mode === "append"
          ? new Set(baseTransactions.flatMap((row) => (row.fingerprint ? [row.fingerprint] : [])))
          : new Set(),
      existingTransactions: mode === "append" ? baseTransactions : [],
      markPrice: getMarkPrice,
    });
  }, [
    normalized,
    mode,
    basePortfolio,
    replaceBasis,
    openingState,
    baseTransactions,
    baseReady,
    getMarkPrice,
  ]);

  const budgetBlockedTickers = useMemo(() => {
    if (!normalized) return new Set<string>();
    const existing = new Set([
      ...existingTrackedTickers.map((ticker) => ticker.toUpperCase()),
      ...basePortfolio.holdings.map((holding) => holding.ticker.toUpperCase()),
    ]);
    if (mode === "replace") {
      for (const holding of basePortfolio.holdings) {
        existing.delete(holding.ticker.toUpperCase());
      }
    }
    const incoming = Array.from(
      new Set(
        normalized.transactions.flatMap((row) => (row.ticker ? [row.ticker] : [])),
      ),
    ).filter((ticker) => !existing.has(ticker));
    const remaining = Math.max(0, 40 - existing.size);
    return new Set(incoming.slice(remaining));
  }, [normalized, existingTrackedTickers, basePortfolio, mode]);

  const setupBlocked =
    !baseReady ||
    !mode ||
    tickerValidationUnavailable ||
    !normalized ||
    (mode === "replace" && !replaceBasis) ||
    (mode === "replace" &&
      replaceBasis === "opening" &&
      (!openingAt || !confirmedTimeZone || !openingState));
  const normalizationIssues = normalized?.issues.length ?? 0;
  const replayIssues = preview?.issues.length ?? 0;
  const flagged =
    normalizationIssues +
    replayIssues +
    budgetBlockedTickers.size +
    unsupportedTickers.size;
  const commitDisabled = busy || setupBlocked || !preview || (flagged > 0 && !excludedFlaggedRows);

  async function commit() {
    if (commitDisabled || !normalized || !preview || !mode) return;
    setBusy(true);
    setError(null);
    const blockedIds = new Set(preview.issues.map((issue) => issue.transactionId));
    const includedTransactions = excludedFlaggedRows
      ? normalized.transactions.filter(
          (row) =>
            !blockedIds.has(row.id) &&
            !(
              row.ticker &&
              (budgetBlockedTickers.has(row.ticker) ||
                unsupportedTickers.has(row.ticker))
            ),
        )
      : normalized.transactions;
    const finalPreview = replayPortfolioTransactions({
      portfolio: mode === "replace" ? { ...basePortfolio, holdings: [], cashAvailable: 0 } : basePortfolio,
      openingState,
      transactions: includedTransactions,
      existingFingerprints:
        mode === "append"
          ? new Set(baseTransactions.flatMap((row) => (row.fingerprint ? [row.fingerprint] : [])))
          : new Set(),
      existingTransactions: mode === "append" ? baseTransactions : [],
      markPrice: getMarkPrice,
    });
    if (finalPreview.issues.length > 0 || finalPreview.ledger.length === 0) {
      setBusy(false);
      setError("Resolve or explicitly exclude every flagged row before importing.");
      return;
    }
    const result = await onCommit({
      portfolioId: basePortfolio.id,
      expectedRevision: basePortfolio.revision ?? 0,
      portfolio: finalPreview.portfolio,
      transactions: finalPreview.ledger,
      batch: {
        id: activeBatchId,
        mode,
        report: normalized.report,
        replaceBasis: mode === "replace" ? (replaceBasis ?? undefined) : undefined,
        openingCash: openingState?.cash,
        openingAt: openingState?.asOf,
        openingTimeZone: openingState?.timeZone,
      },
    });
    setBusy(false);
    if (result === "applied") {
      setFile(null);
      setRawRows(null);
      onCancel();
    } else if (result === "conflict") {
      const refreshed = await onRefreshBase().catch(() => null);
      if (refreshed) {
        setBasePortfolio(refreshed.portfolio);
        setBaseTransactions(refreshed.transactions);
        setActiveBatchId(batchId());
        setError("This portfolio changed in another session. The preview has been refreshed against the latest saved portfolio; review it again before importing.");
      } else {
        setError("This portfolio changed in another session. Close and reopen the import to review the latest saved portfolio.");
      }
    } else {
      setError("The import was not saved. Your portfolio has not changed.");
    }
  }

  return (
    <ForgeTableModal
      title="Import portfolio transactions"
      titleId="current-watch-import-title"
      onCancel={onCancel}
      onDone={() => void commit()}
      doneLabel={busy ? "Importing…" : "Import"}
      doneDisabled={commitDisabled}
      intro="Your file stays on this device while we prepare the preview. We retain only Transaction Type, Ticker, Quantity, Fill Price, Amount (USD), Date / Time, and Time Zone."
    >
      <div className="watch-import-flow">
        <section className="watch-import-section" aria-labelledby="import-mode-label">
          <span className="config-label forge-label" id="import-mode-label">Choose how to apply this import</span>
          <div className="watch-import-radio-list" role="radiogroup" aria-labelledby="import-mode-label">
            <button type="button" className="watch-import-radio-row" role="radio" aria-checked={mode === "append"} onClick={() => setMode("append")}>
              <Radio decorative checked={mode === "append"} />
              <span>Add transactions to current portfolio</span>
            </button>
            <button type="button" className="watch-import-radio-row" role="radio" aria-checked={mode === "replace"} onClick={() => setMode("replace")}>
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
                      <li>No more than 40 tickers per file.</li>
                      <li>Exactly one worksheet per XLSX file or one table per CSV file.</li>
                      <li>No formulas, macros, external links, encrypted files, XLS, or XLSM.</li>
                      <li>Strategy scoring for imported history is not available yet. Imported transactions are retained for later Dashboard analysis.</li>
                      <li>Accepted columns: Transaction Type, Ticker, Quantity, Fill Price, Amount (USD; required for deposits and withdrawals), Date / Time, and Time Zone (ET/EST, CT/CST, MT/MST, PT/PST, Alaska, Hawaii, Arizona, or UTC).</li>
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
              <span>{normalized.report.ignoredColumnCount} extra columns stripped</span>
              <span>{normalized.report.normalizedCellCount} values normalized</span>
              <span>{normalized.report.fractionalRowCount} fractional rows</span>
              <span>{flagged} flagged rows</span>
            </div>
            {flagged > 0 ? (
              <div className="watch-import-issues">
                {[...normalized.issues.map((issue) => ({ row: issue.row, message: issue.message })), ...(preview?.issues ?? []).map((issue) => ({ row: issue.sourceRow ?? 0, message: issue.message }))].slice(0, 20).map((issue, index) => (
                  <div key={`${issue.row}-${index}`} className="watch-import-issue"><span>Row {issue.row || "—"}</span><span>{issue.message}</span></div>
                ))}
                {budgetBlockedTickers.size > 0 ? (
                  <div className="watch-import-issue">
                    <span>Budget</span>
                    <span>
                      Exclude {Array.from(budgetBlockedTickers).join(", ")} or remove other tracked tickers to stay within the 40-ticker market-data limit.
                    </span>
                  </div>
                ) : null}
                {unsupportedTickers.size > 0 ? (
                  <div className="watch-import-issue">
                    <span>Ticker</span>
                    <span>
                      No market data was found for {Array.from(unsupportedTickers).join(", ")}. Review the symbols or explicitly exclude their rows.
                    </span>
                  </div>
                ) : null}
                <button type="button" className={excludedFlaggedRows ? "btn btn--small btn--ghost is-active" : "btn btn--small btn--ghost"} onClick={() => setExcludedFlaggedRows((current) => !current)}>
                  {excludedFlaggedRows ? <X aria-hidden /> : <Plus aria-hidden />}
                  {excludedFlaggedRows ? "Include flagged rows again" : "Exclude flagged rows and regenerate preview"}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
        {tickerValidationUnavailable ? (
          <div className="forge-error watch-import-file-row" role="alert">
            <span>Ticker verification is temporarily unavailable. Your import remains blocked until the symbols can be checked.</span>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={busy || !rawRows}
              onClick={() => {
                if (!rawRows) return;
                setBusy(true);
                void normalizeRows(rawRows, confirmedTimeZone).finally(() => setBusy(false));
              }}
            >
              Retry ticker check
            </button>
          </div>
        ) : null}
        {status ? <p role="status">{status}</p> : null}
        {error ? <p className="forge-error" role="alert">{error}</p> : null}
      </div>
    </ForgeTableModal>
  );
}
