# Current Watch Edit and Import Foundations

## Scope

This contract covers Checkpoints 1–5: temporal and transaction foundations,
normalized persistence, Edit Mode controls, safe CSV/XLSX import, and recovery.
Historical market reconstruction and back-scoring are outside this split.
Imported transactions are retained for future analysis but are not counted as
scored actions until that workflow binds each event to a published market cycle
and effective strategy version.

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
Confirmed manual events normalize in the same database transaction that saves
their `user_state` projection, so a partial client/network failure cannot leave
holdings and the ledger disagreeing.

## Import privacy and lifecycle

- Inputs: CSV/XLSX only, 5 MB, 5,000 data rows, 40 tickers, USD, exactly one
  XLSX worksheet or one CSV table. Multi-sheet workbooks are rejected rather
  than asking the user to choose a sheet.
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
- Only sanitized tickers may reach the existing quote endpoint for verification.
  No filename, extra column, raw rejected value, or file content enters APIs,
  logs, analytics, or errors.
- Review reports counts only: retained rows, stripped columns, normalized
  values, fractional rows, ambiguous times, invalid rows, and ticker count.

## Replay and review invariants

- Import mode has no default; the user chooses append or replace.
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
- Default commit is all-or-none. Rows leave the preview only after the user
  explicitly chooses to exclude flagged rows and regenerate it.

## Recovery and scoring boundaries

- Edit Mode pauses workspace persistence until Update, or until Cancel restores
  the captured snapshot.
- Archived sources live outside active `portfolios`, excluding them structurally
  from cadence, provider registration, Weather, Forge, Helm, and scoring.
- Portfolio/removal and replace-import archives expire after 30 days. A daily
  database job purges expired snapshots and archived normalized rows.
- Permanent deletion is a separate two-confirmation action.
- Remove tracking and history is staged, undoable by Cancel, and archived for
  30 days after Update. The recovery toast can restore history without tracking.
- Imported events use `source = import` and are excluded from current Plan
  Adherence, actions, hold time, zone impact, and cash-flow scoring. Checkpoint 6
  may include only successfully reconstructed events.

## Migration and rollback

This local implementation does not authorize a production migration. Rollout:

1. apply `20260731170000_current_watch_import_foundations.sql`;
2. verify RLS with two isolated Beta accounts;
3. verify direct table writes are denied and stale-revision, duplicate-batch,
   invalid-time-zone, and invalid-math payloads are rejected;
4. verify archive/restore swaps and scheduled purge outside production;
5. deploy the client only after the schema exists;
6. monitor RPC failures, rejection counts, payload size, and worker timeouts
   without logging user cells or filenames.

Rollback is client-first: hide import/recovery entry points and leave additive
tables intact. Revert reads to the legacy ledger only if needed. Do not drop
normalized tables or archives during rollback; that destroys recovery data.
