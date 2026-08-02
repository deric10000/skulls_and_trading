# Current Watch Edit and Import Foundations

## Scope

This contract covers Checkpoints 1–5: temporal and transaction foundations,
normalized persistence, Edit Mode controls, safe CSV/XLSX import, and recovery.
Checkpoint 6 is defined separately in
`docs/current-watch-historical-reconstruction.md`. Imported transactions count
as scored actions only after that workflow binds each event to an at-or-before
market cycle and effective strategy/ticker assignment.

## Sources of truth

- `user_state.portfolios` remains the current holdings/cash projection consumed
  by Current Watch and scoring.
- `portfolio_transactions` is the normalized, idempotent timeline for new
  manual and imported activity. `user_state.share_fills` remains a compatibility
  source for legacy manual events; imported rows never return to that blob.
- `portfolio_revisions` owns optimistic concurrency for transaction batches.
- `portfolio_import_batches` owns import mode, sanitized counts, commit status,
  batch identity, and an opening-state boundary when one is explicitly chosen.
  It never stores a raw file, filename, rejected cell, or ignored-column value.
- `portfolio_archives` and `portfolio_ticker_history_archives` own 30-day
  recovery snapshots.
- `strategy_versions` and `strategy_portfolio_application_episodes` own future
  effective-date reconstruction boundaries.

The atomic import RPC locks the revision, revalidates the normalized shape,
replays cash/share continuity, verifies the final projection, inserts the
ledger, archives replace-import state, increments the revision, and updates the
portfolio projection in one database transaction.
New normalized tables are read-only to authenticated clients. Import, manual
transaction, archive, restore, permanent-delete, and strategy-history writes
run only through narrow server functions that re-derive stored fingerprints and
classification fields instead of trusting browser-supplied metadata.
Confirmed manual events use `commit_current_watch_edit`. The RPC locks the
portfolio revision and `user_state`, replays share/cash continuity, validates
the final projection, applies only Current Watch strategy assignment fields,
archives requested ticker history, advances the server-owned revision, and
saves the compatibility ledger in one database transaction. Its trigger
normalizes the manual ledger before that transaction can commit. The browser
does not publish the optimistic projection or leave Edit Mode until the RPC
succeeds.

Broad compatibility saves and narrow portfolio RPCs share one per-account
mutation queue. Entering Edit Mode flushes the latest pending compatibility
save before persistence pauses. This prevents an older debounced workspace
snapshot from landing after an import, manual update, or archive.

## Import privacy and lifecycle

- Inputs: CSV/XLSX only, 5 MB, 5,000 data rows, 40 final active tracked tickers,
  USD, exactly one
  XLSX worksheet or one CSV table. Multi-sheet workbooks are rejected rather
  than asking the user to choose a sheet. Native Apple Numbers packages are not
  parsed; the UI directs Numbers users to export as CSV or Excel (`.xlsx`).
- CSV input may use the standard template or a recognized broker-shaped header
  set. Webull order exports map `Side`, `Symbol`, executed `Filled` quantity,
  `Avg Price`, and `Filled Time` into the same normalized allowlist without
  requiring the user to edit the file. Rows with no executed quantity are
  excluded locally; a cancelled order with an executed partial fill retains
  that executed portion. Broker name, order settings, placed time, and original
  order-price columns are stripped and never persisted.
- Parsing and workbook inspection run in a browser worker. The raw file is not
  uploaded or saved.
- XLS, XLSM, encrypted/damaged files, macros, formulas, external workbook links,
  and unsafe expanded ZIP sizes are rejected before normalization.
- The allowlist is Transaction Type, Ticker, Quantity, Fill Price, Amount,
  Date / Time, and optional Time Zone. Every other column is dropped by position
  rather than guessed through PII heuristics.
- The template uses familiar `EST` examples. Import normalization accepts
  common U.S. regional names and abbreviations for Eastern, Central, Mountain,
  Arizona, Pacific, Alaska, Hawaii, Aleutian, and UTC, then stores the matching
  IANA zone so daylight-saving transitions can still be validated.
- Date normalization accepts year-first and U.S. month-first dates, 24-hour or
  AM/PM clocks, explicit UTC offsets, and embedded U.S. abbreviations such as
  EST/EDT. A readable embedded zone needs no redundant confirmation. Only a
  missing or unreadable zone asks the user to choose one; invalid dates receive
  a date-specific error instead of a time-zone error.
- Only sanitized tickers may reach the existing quote endpoint for verification.
  No filename, extra column, raw rejected value, or file content enters APIs,
  logs, analytics, or errors.
- Review reports counts only: retained rows, stripped columns, normalized
  values, fractional rows, ambiguous times, invalid rows, and ticker count.

## Replay and review invariants

- Import mode has no default; the user chooses append or replace.
- Import and portfolio archive cannot start while Edit Mode is dirty. The user
  must Update or Cancel first; neither operation implicitly saves or discards a
  draft.
- Import preview loads a durable portfolio/revision/ledger base after older
  workspace writes finish. A revision conflict reloads that base and rebuilds
  the preview for another explicit review.
- Replace requires full-history replay from zero or an explicit opening cash/time
  boundary. Opening positions are Buy rows at that boundary in this split.
- Quantity stores six decimals and displays without trailing zeros. Manual entry
  defaults to whole shares, with a per-row fractional control; existing
  fractional positions enable it automatically.
- A manual Update accepts one transaction row per ticker. Additional same-ticker
  activity uses a later Update so share-before/share-after state stays explicit.
- Cash is USD rounded to cents. Total quantity is derived, never imported.
- Rows replay chronologically. Buys require prior funding, sells cannot exceed
  shares then held, and withdrawals cannot exceed available cash.
- Exact duplicates, same-time overlaps, unsupported symbols, ticker budget,
  invalid sequences, ambiguous time zones, and concurrent revisions are flagged.
- The 40-ticker market-data budget applies to the final active tracked universe,
  not every historical symbol in an import. Closed historical symbols remain in
  the ledger without quote registration.
- Append imports containing Buy/Sell rows require an explicit cash choice with
  no default: **Apply transaction cash flow** subtracts buys/adds sells against
  current cash and blocks a negative balance; **Keep current cash balance**
  changes holdings/market value while quantity rows keep cash unchanged.
  Explicit Deposit/Withdrawal rows always affect cash in both modes. The enum is
  revalidated atomically by the server; older clients default to `apply`.
- Default commit is all-or-none. Rows leave the preview only after the user
  explicitly chooses to exclude flagged rows and regenerate it.

## Recovery and scoring boundaries

- Edit Mode pauses workspace persistence until an acknowledged Update, or until
  Cancel restores the captured portfolio, revision, strategy assignments, and
  portfolio-scoped compatibility ledger snapshot. The cleanup snapshot is a
  rollback defense; reviewed transactions remain drafts until commit succeeds.
  If the widget unmounts during Update, cleanup waits for that commit and
  restores the snapshot only after failure, never after a durable success.
  A successful apply marks the edit session committed so later render sync
  cannot re-arm snapshot restore; Cancel/Discard/review close are blocked while
  a commit is in flight; the in-flight commit promise is cleared when the
  session ends so a prior apply cannot skip restore on a later edit session.
- Batch Transactions carries a staged first deposit into the same review. A
  later dirty cash edit must be updated or canceled before Batch opens, so the
  batch flow cannot silently discard it; later deposits can instead be added
  explicitly with the modal's Cash Deposit action.
- Archived sources live outside active `portfolios`, excluding them structurally
  from cadence, provider registration, Weather, Forge, Helm, and scoring.
- Portfolio/removal and replace-import archives expire after 30 days. A daily
  database job purges expired snapshots and archived normalized rows.
- Permanent deletion is a separate two-confirmation action.
- Remove tracking and history is staged, undoable by Cancel, and archived for
  30 days after Update. The recovery toast can restore history without tracking.
- Imported events use `source = import` and are excluded from current Plan
  Adherence, actions, hold time, zone impact, and cash-flow scoring unless their
  Checkpoint 6 reconstruction status is explicitly `scored`.
- Backdated in-app events older than the active 15-minute session use the same
  Checkpoint 6 boundary and remain pending until reconstructed. Current-session
  reviewed events retain their immediate stamps.

## Migration and rollback

This local implementation does not authorize a production migration. Rollout:

**Data-safety manifest:** protected facts are the existing portfolio projection,
cash, holdings, normalized/compatibility transaction history, custom/default
strategy state, archives, and revisions. Supabase remains authoritative; the
browser preview is a draft and market quote results are projections. The broker
normalizer adds no persisted raw fields. The forward migration replaces only
the atomic import function: old clients omit `cashTreatment` and retain the
existing `apply` behavior; new preserve-cash commits require append mode and
server-verified equal cash stamps on qty rows. No existing row is rewritten or
deleted. Rollback is client-first/roll-forward: hide the new choices or deploy
the prior client while retaining the compatible server function and all data.
Production verification must compare portfolio cash/holdings/revisions and
ledger identity before/after using a designated test account, including retry
and duplicate-batch behavior.

1. apply `20260731170000_current_watch_import_foundations.sql`, then
   `20260801193000_atomic_current_watch_edits.sql`, then
   `20260801213000_historical_reconstruction.sql`, then
   `20260802001000_broker_import_cash_treatment.sql`;
2. verify RLS with two isolated Beta accounts;
3. verify direct table writes are denied and stale-revision, duplicate-batch,
   invalid-time-zone, and invalid-math payloads are rejected;
4. verify archive/restore swaps and scheduled purge outside production;
5. deploy the client only after the schema exists;
6. monitor RPC failures, rejection counts, payload size, and worker timeouts
   without logging user cells or filenames.

## Import commit error contract

`commit_portfolio_transaction_batch` remains the financial authority. Failures
raise stable exception names (`insufficient_cash`, `invalid_trade_cash_math`,
`oversell`, `portfolio_revision_conflict`, …) with an optional JSON DETAIL that
may include only safe fields: `code`, `sourceRow`, `ticker`, `transactionType`,
`filledAt`, cash/share amounts, and ticker-limit counts. The client maps those
codes through `portfolioImportCommitErrors.ts` into user-facing copy. Raw SQL,
stack traces, and unconstrained database prose never reach the modal. Preserve-
cash commits require this migration; until it is applied, preserve-mode cash
math rejects with a schema-update-required message while the portfolio stays
unchanged.

Rollback is client-first: hide import/recovery entry points and leave additive
tables intact. Revert reads to the legacy ledger only if needed. Do not drop
normalized tables or archives during rollback; that destroys recovery data.
