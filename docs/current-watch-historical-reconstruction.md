# Current Watch Historical Reconstruction

## Scope

Checkpoint 6 binds eligible imported portfolio transactions and backdated
in-app transactions from the seven days before commit to the evidence that
existed at the time. In-app actions within the active 15-minute session retain
their immediate reviewed stamps; older timestamps use reconstruction. It does not backdate an
account, portfolio, strategy, or ticker assignment, and it does not implement a
Dashboard. Older transactions remain normalized history for later analysis.

## Truth boundaries

A quantity transaction is scored only when all of these are available:

1. the portfolio already existed;
2. an immutable strategy version and portfolio-application episode were
   effective at the transaction timestamp;
3. default-strategy ticker assignment was effective at that timestamp (custom
   strategies use their versioned ticker exclusions); and
4. a complete market scoring cycle exists at or before the transaction with
   every required ticker and market-context input.

The cycle lookup never uses a later snapshot. A weekend or holiday transaction
may use the latest prior completed cycle only within a 96-hour lookback. Missing
or partial evidence is `incomplete`, not neutral and not estimated. A transaction
before strategy application is `unscored`. A transaction outside the seven-day
window is `skipped` but is still replayed so later portfolio state remains
deterministic. If a persisted before-value does not match the replayed state,
that row and its dependent remainder are `incomplete` rather than scored from
an uncertain portfolio basis.

Cash deposits and withdrawals need effective strategy attribution but no market
cycle. They retain their existing cash-flow classification.

## Replay boundary

- Append starts from the durable portfolio the user reviewed immediately before
  import. That is an explicit import-mode assumption, not a claim about a
  brokerage's earlier state.
- Replace/full-history starts at zero.
- Replace/opening starts from the user-confirmed opening cash and time.
- Every row is replayed chronologically, including older/unscored rows. The job
  persists only the sanitized working projection: ticker, shares, average cost,
  strategy ids, cash, portfolio identity, and a replay-integrity marker.

## Durable lifecycle

`portfolio_import_batches` insertion enqueues one
`historical_reconstruction_jobs` row inside the existing atomic import RPC.
The raw file and rejected/extra cells never cross this boundary.
The existing normalized-ledger trigger also groups newly committed manual rows
older than 15 minutes into one job per portfolio, using the atomic edit's OLD
portfolio as its replay basis.

The machine-only Edge scorer claims one job with a lease, reads at most 20 rows,
replays them sequentially through the same pure scoring authority, commits the
derived results and replay cursor atomically, then releases the job. A two-minute
`pg_cron` recovery call continues work after the browser closes. Leases,
idempotent result keys, five-consecutive-failure retry state, and archive supersession prevent
double counting and stale writes. Historical work runs on this independent
recovery path rather than delaying live conviction-cycle requests.

Job states are `queued`, `running`, `retrying`, `complete`, `incomplete`,
`superseded`, and `failed`. The Current Watch import modal polls only an active job every 30
seconds, shows exact processed/total counts, and derives ETA from the measured
20-row/two-minute cadence. It refreshes the normalized ledger once a job reaches
a terminal scored state.

## Market evidence retention

Live complete cycles stay at their existing three-day retention. On publication,
the Worker also writes a gzip-compressed scoring-only cycle (quotes,
fundamentals, technicals, timeframe indicators, and market context; no Weather
or narrative payload) with ten-day retention and a bounded 300-entry index.
This supplies seven scoring days plus weekend/holiday and retry cushion without
duplicating the substantially larger Weather payload.

The internal historical endpoint requires the existing constant-time scoring
secret and filters its response to at most the account's 40 requested symbols.
No account id, transaction, filename, or personal value is written to KV.

## Persistence and rebuild

- `portfolio_transactions` remains the immutable fact ledger. Reconstruction
  columns are a replaceable derived projection.
- `historical_transaction_reconstructions` stores the evidence link, effective
  strategy/version ids, compact alignment result, and explicit outcome reason.
- `strategy_versions`, `strategy_portfolio_application_episodes`, and
  `strategy_ticker_application_episodes` preserve forward-only effective
  boundaries from durable `user_state` writes. Migration backfill begins at
  migration time; it never invents an earlier start date. Legacy portfolios
  without `createdAt` receive that same migration-time boundary.
- Only `reconstruction_status = scored` makes an imported row visible to Helm,
  adherence, hold-time, action, zone-impact, and cash-flow calculations.

## Capacity and rollback

At 20 rows every two minutes, a single uninterrupted 800-row job estimates about
80 minutes. Active jobs rotate by last-claim time so one large import cannot
starve a later account. UI time is therefore processing time remaining, not a
completion promise; queue time can vary. Imports and live scoring remain usable
while history runs.

Rollout is schema → Worker archive/endpoint → Edge processor → client. Do not
enable the client before the additive migration and machine endpoints exist.
Rollback is client/processor first: stop the historical cron and hide progress,
while retaining jobs, normalized transactions, strategy history, and results.
Never drop reconstruction tables during rollback.
