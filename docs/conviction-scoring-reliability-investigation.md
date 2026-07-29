# Conviction Scoring Reliability Investigation

## Document purpose

This document records the investigation into two related production symptoms:

1. Multiple portfolio holdings display **Score Pending** even though a recent
   conviction check, or at least an earlier valid check, was expected to exist.
2. GOOG displays the expected EMA-related plan notification while other stocks
   that appear to meet similar conditions do not.

It also defines the current product decisions, confirmed findings, suspected
failure modes, and the recommended staged plan for correcting the reliability
issues.

This is an investigation and implementation-planning document. It is not an
instruction to deploy automatically. Before implementation, the executing agent
must read all applicable repository rules, verify these findings against the
current branch, and separate code changes, database migrations, production data
reconciliation, and deployment into reviewable checkpoints.

## Current product decisions

The following behavior is intentional and must be preserved:

- **Score Pending remains the default when a current score does not yet exist.**
  A strategy change, ticker assignment, new holding, or new cadence can require
  a new check before the score is current.
- An older score must not be silently copied forward and represented as the
  current score.
- Daily and cadence snapshots must contain only current, successfully completed
  conviction results.
- A portfolio full of outdated conviction values must not be snapshotted as if
  it were checked for the current day or cadence.
- Conviction formulas, rule-chip semantics, category weights, EMA calculations,
  status bands, portfolio aggregation, and snapshot cadence are not being
  redesigned by this effort.

The required refinement is that **Score Pending must only describe valid work
that is waiting or processing**. A check that attempted and failed must show a
warning or failure state rather than remaining indistinguishable from ordinary
pending work.

## Repository and production context

The investigation was performed read-only. No application source files were
modified during the investigation.

At the time of the investigation:

- Git branch: `codex/market-weather`
- The worktree already contained untracked `.wrangler/` and `supabase/.temp/`
  directories.
- The deployed Cloudflare Worker was reachable and running version
  `c5345299-d5f3-4999-85cf-e43e7a797889`.
- The latest inspected production cycle was complete and reported no cycle
  errors.

Before implementation, read and follow at least:

- `.cursor/rules/codex-usage.mdc`
- `.cursor/rules/components.mdc`
- `.cursor/rules/data-architecture.mdc`
- `.cursor/rules/design-governance.mdc`
- `.cursor/rules/git-workflow.mdc`
- `.cursor/rules/locked-surface-qa.mdc`
- `.cursor/rules/performance-budget.mdc`
- `.cursor/rules/product-vision.mdc`
- `.cursor/rules/security-hardening.mdc`
- `data-architecture.md`
- `design-system.md`
- `product-vision.md`
- `product-voice.md`

Also locate and follow any more narrowly scoped repository instructions.

## Executive summary

The production symptoms are most likely related rather than independent.

There are two broad reliability problems:

1. **Market symbol registration can diverge from the visible Supabase
   portfolio.** The UI can show a holding while the Cloudflare hourly collector
   does not include that ticker in its market cycle. A ticker without complete
   cycle inputs cannot receive a current conviction result.
2. **The scoring system uses strict but overly broad invalidation.** Strict
   invalidation is correct for snapshot integrity, but current revision checks
   can be invalidated by unrelated workspace activity or unnecessarily broad
   hashes. Multi-strategy ordering is already canonicalized by
   `strategiesForHolding()` and is not a Score Pending root cause.

When conviction readiness is false, Layer 3 plan overlays and notifications are
suppressed. Therefore, a correct EMA calculation can exist while the related
notification remains hidden because the score is pending.

The recommended solution is a reliability refactor around the existing scoring
engine, not a replacement of the scoring engine.

## Confirmed production evidence

### Published Cloudflare cycle

A read-only inspection of the production KV key
`market:cycle:published` returned a completed cycle with:

- Cycle key: `market:cycle:complete:2026-07-28T230000000Z`
- Cycle time: `2026-07-28T23:00:00.000Z`
- Completed: `2026-07-28T23:30:00.130Z`
- Published: `2026-07-29T00:00:59.000Z`
- Next expected cycle: `2026-07-29T01:00:00.000Z`
- Symbols: `ELF`, `GOOG`, `MO`, `MSFT`, `NVDA`
- Cycle-reported errors: none

The user's visible portfolio also contained `CRWV`, `CELH`, and `ACHR`, but
those symbols were absent from the inspected global cycle.

Important qualification: the published cycle contains the global union of
registered symbols. The presence of MO does not prove that MO belongs to this
specific account. It may belong to another account or be an orphaned registry
entry. Its ownership must be established before any production cleanup.

The absence of CRWV, CELH, and ACHR from the global cycle is significant:
Cloudflare was not collecting those symbols for any active KV registry entry at
the time of that cycle.

### Production daily EMA readings

The inspected cycle contained these `1D` price-versus-EMA readings:

| Ticker | Price vs EMA 10 | Price vs EMA 20 | Price vs EMA 50 |
| --- | ---: | ---: | ---: |
| GOOG | -1.26% | -3.38% | -5.18% |
| NVDA | -3.25% | -3.54% | -3.66% |
| MSFT | +0.92% | +0.98% | -0.24% |
| ELF | +6.39% | +10.82% | +19.55% |
| MO | +2.42% | +3.03% | +4.48% |

Under equivalent strategy assignment, thresholds, and a `1D` rule timeframe:

- GOOG and NVDA should both breach rules requiring price to remain above the
  10-, 20-, and 50-period EMAs.
- MSFT should breach only the 50-period condition.
- ELF and MO should not breach those daily EMA conditions.

EMA behavior must always be compared using the same timeframe and completed
cycle timestamp. For example, GOOG was above its 10-, 20-, and 50-period EMAs
on the inspected `1h` data while below all three on `1D`.

## How the front end can show stocks Cloudflare is missing

The visible portfolio and the Cloudflare collection registry are separate
stores:

```text
Supabase user_state.portfolios
        |
        +--> visible portfolio and holdings in the application

Cloudflare KV market:registry:<userId>
        |
        +--> global hourly market collection universe
```

The UI loads portfolio holdings from Supabase. Cloudflare builds its market
cycle from KV registry entries. A holding can therefore remain visible while
Cloudflare does not know that it should collect market data for it.

### Code-supported registry failure modes

The following behavior is supported by the current code and must be verified
again before implementation:

1. In authoritative/server-scoring mode, the full portfolio market bootstrap is
   skipped by the effect in `src/state/AppState.tsx`.
2. Adding a ticker calls `registerPortfolioMarketSymbols([ticker])`, sending a
   singleton list.
3. Enabling a ticker for a strategy also sends a singleton list.
4. The Worker registration handler writes the submitted list directly to
   `market:registry:<userId>`.
5. The endpoint therefore behaves as full replacement even when the caller is
   using it like an incremental add.
6. Scheduled collection reads the global symbol set from those KV entries.
7. Supabase separately maintains `market_symbol_subscriptions`, but Cloudflare
   does not use that table as its direct symbol authority.

A plausible failure sequence is:

```text
Portfolio contains GOOG, NVDA, CRWV, CELH, and ACHR
        |
        +--> Supabase persists the full visible portfolio
        |
        +--> browser sends a partial or singleton registry request
                  |
                  +--> Cloudflare replaces the account KV symbol list
                            |
                            +--> later cycle omits some portfolio symbols
                                      |
                                      +--> no complete market inputs
                                                |
                                                +--> no current score
```

Correctness currently depends too heavily on browser-side synchronization.
A closed browser, failed network request, authoritative-mode boot behavior, or
partial registration request can leave the two systems out of sync.

## Conviction readiness behavior

The authoritative UI requires a combined result that exactly matches:

- Portfolio ID
- Ticker
- Complete current applicable strategy set
- Every current cadence definition hash for those strategies
- The stored result's input-revision map

If the combined row is missing or the scope comparison fails,
`isConvictionScoreReadyForWatch` returns false. The UI then displays Score
Pending and suppresses status overlays.

This strict rejection of a superseded score is correct for current-score and
snapshot integrity. The problem is that all non-ready causes collapse into the
same visible state.

## Scoring reliability defects and risks

### 1. Definition hashes are overly broad

Each strategy/cadence definition hash currently includes:

- Strategy ID
- Cadence
- Complete strategy JSON
- All workspace portfolios
- All share fills

Consequences:

- A change affecting CRWV can invalidate GOOG.
- A transaction affecting NVDA can invalidate ELF.
- One portfolio change can invalidate strategies applied only to another
  portfolio.
- Previously valid rows remain stored but fail current-scope validation, so the
  UI correctly refuses to treat them as current.

The rejection is correct; the invalidation scope is not.

### 2. General workspace saves can invalidate active runs

Scoring runs capture `user_state.updated_at`. Before scoring and again at
completion, the system requires that timestamp to match exactly.

Every workspace save assigns a new `updated_at`. Because workspace saves include
the complete payload, changes unrelated to scoring can race an active run:

- Captain logs
- Preferences
- Flags
- Profile changes
- UI state
- Watchlist presentation data

This can fail an otherwise valid run with a workspace-revision error.

### 3. Multi-strategy ordering is already canonicalized

Applicable strategy IDs are sorted by `id` in `strategiesForHolding()` before
server combined scoring. The database requires a sorted `strategy_ids` array,
the client re-sorts on read, and existing tests verify sorted combined IDs.

An earlier investigation inference that workspace order could fail DB validation
was incorrect: `alignment.ts` maps IDs without a local `.sort()`, but its input
is already sorted. Multi-strategy ordering is **not** a supported root cause of
Score Pending.

Remain defensive: keep sort/dedupe invariants and regression tests proving that
reordering strategies in workspace JSON cannot change combined-result identity.
Do not treat this as a defect-fix implementation phase.

### 4. Failure is presented as pending

The database records run status and errors, but the browser's readiness model
largely reduces the outcome to ready versus not ready.

This makes the following cases visually indistinguishable:

- Correctly scheduled future work
- Active processing
- Missing symbol registration
- Incomplete market data
- Failed queue dispatch
- Exhausted retries
- Superseded work
- Overdue work
- Combined-scope / revision mismatches (distinct from strategy JSON order)

### 5. Notifications are suppressed by score readiness

Layer 3 overlays and notifications are intentionally suppressed until
conviction readiness is true. This protects the user from warnings calculated
against incomplete or mismatched inputs.

It also means that an EMA breach can be correctly present in market data but
not displayed when the ticker's conviction result is missing or rejected.
This is the likely connection between Score Pending and inconsistent EMA
notifications.

## Target architecture

### Symbol authority

Supabase-derived active subscriptions should become the authoritative symbol
source:

```text
Supabase portfolios
        |
        v
market_symbol_subscriptions
        |
        v
protected server-to-server symbol snapshot
        |
        v
Cloudflare cycle manifest
        |
        v
market collection and conviction scoring
```

Browser requests may expedite reconciliation, but correctness must not depend
on the browser being open or successfully registering symbols.

### Scoring authority

Every score should be tied to an immutable scoring scope and market cycle:

```text
scoring-relevant workspace projection
        |
        v
deterministic scoring revision
        |
        +--> required ticker set
        +--> strategy/cadence scope
        +--> applicable position inputs
        |
        v
preflight against completed market cycle
        |
        v
claimed scoring run
        |
        v
current-revision result and persisted notifications
```

## Required scoring states

The system should distinguish at least:

| State | Meaning | Recommended UI |
| --- | --- | --- |
| `scheduled` | Valid future work is scheduled | Score Pending with next check |
| `waiting_for_data` | Required symbol or cycle input is missing | Waiting for market data; identify ticker |
| `processing` | A worker claimed the run | Conviction check in progress |
| `retrying` | A transient attempt failed | Retrying; show next attempt |
| `ready` | Current revision completed | Show current score and notifications |
| `stale` | A prior valid result belongs to an older revision | Awaiting updated score; optionally show historical score |
| `superseded` | Relevant inputs changed during processing | Strategy changed; replacement scheduled |
| `failed` | Permanent failure or retries exhausted | Conviction check failed warning |
| `incomplete` | Cycle completed without required inputs | Market data incomplete warning |
| `overdue` | Scheduled work missed its processing window | Conviction check overdue warning |

Score Pending should be used only for legitimate scheduled or waiting work. It
must not conceal terminal or operational failure.

### Recommended error categories

- `symbol_not_registered`
- `cycle_missing_symbol`
- `market_data_incomplete`
- `dispatch_failed`
- `processing_timeout`
- `workspace_superseded`
- `scoring_revision_mismatch`
- `combined_scope_invalid`
- `retry_exhausted`

Raw sensitive errors should remain in protected logs. The UI should receive
safe categories and useful remediation information.

## Recommended implementation plan

### Phase 1: Add observability and explicit run states

Goal: make the current failure modes visible before changing orchestration.

Recommended work:

1. Extend the normalized run/read model to expose:
   - Latest status
   - Scheduled, claimed, and completed times
   - Attempt count
   - Safe error category
   - Affected ticker set
   - Next retry time
   - Whether a previous valid result exists
2. Define and validate allowed state transitions.
3. Preserve the current readiness and snapshot behavior initially.
4. Update the UI so failed, incomplete, superseded, and overdue work is not
   labeled Score Pending.
5. Add structured logs for every terminal transition.

Acceptance criteria:

- A failed run displays a warning.
- A normally scheduled run still displays Score Pending.
- No new state can accidentally enter a current snapshot.
- Administrators can identify why each ticker is not ready.

### Phase 2: Make Supabase the authoritative symbol registry

Goal: eliminate divergence between visible portfolios and Cloudflare
collection.

Recommended work:

1. Continue deriving `market_symbol_subscriptions` from saved portfolios.
2. Expose a protected server-managed snapshot of active subscriptions to the
   Cloudflare collector.
3. Build cycle manifests from that authoritative snapshot.
4. Stop depending on browser boot for registry correctness.
5. If KV remains as a cache:
   - Store a subscription revision.
   - Replace it only with a complete authoritative snapshot.
   - Do not let singleton add requests replace a complete account list.
6. If partial registry operations remain, make the contract explicit:
   - `replace`
   - `add`
   - `remove`
7. Add periodic reconciliation so transient failures self-heal.
8. Before production cleanup, determine whether MO belongs to another active
   subscription.
9. Reconcile CRWV, CELH, and ACHR from the actual authoritative portfolio state.

Acceptance criteria:

- All active portfolio tickers appear in a cycle without reopening the app.
- Adding one ticker cannot remove another.
- Removing a ticker eventually removes it when no account needs it.
- The system reports differences between portfolio, subscription, manifest,
  and cycle symbol sets.

### Phase 3: Add preflight data validation

Goal: never claim or partially execute a run that cannot succeed.

Before claiming a run, verify:

- Strategy and cadence still exist and are enabled.
- The run's scoring revision is current.
- Every required ticker appears in the completed cycle.
- Required quotes are usable.
- Required technical timeframes are present.
- Fundamentals and market context required by the scoring contract are present.
- The cycle timestamp satisfies the cadence boundary.

If required ticker data is missing:

1. Do not produce a partial score.
2. Mark the run `waiting_for_data` or `incomplete`.
3. Record the missing tickers and input types.
4. Trigger symbol or data reconciliation.
5. Retry using a later complete cycle.

### Phase 4: Replace workspace timestamps with scoring-specific revisions

Goal: prevent unrelated saves from invalidating active work.

The scoring revision should include only data capable of changing the score:

- Applicable strategy rules
- Category configuration and weights
- Cadence
- Applied portfolio IDs
- Ticker-to-strategy assignment
- Relevant holdings
- Shares and average cost where used
- Relevant fills and position inputs
- Other values directly read by scoring

It should exclude:

- Logs
- Captain profile
- Onboarding state
- UI preferences
- Toast and navigation flags
- Taxonomy presentation state
- Unrelated watchlist metadata

Run behavior:

1. Calculate and store the scoring revision at scheduling or claim time.
2. Recalculate it before completion.
3. Commit if it still matches.
4. If relevant inputs changed:
   - Mark the old run `superseded`.
   - Do not classify it as a system failure.
   - Immediately schedule the replacement revision.
   - Prevent the old result from entering snapshots.

Acceptance criteria:

- Adding a log cannot invalidate a run.
- Changing UI preferences cannot invalidate a run.
- Editing an applicable scoring rule supersedes the old run.
- Superseded work cannot write current results or snapshots.

### Phase 5: Narrow invalidation scope

Goal: invalidate only scores affected by a change.

Recommended deterministic revision hierarchy:

1. Strategy definition revision
2. Portfolio scoring-input revision
3. Ticker-strategy revision
4. Combined ticker-strategy-set revision

Expected behavior:

- Editing CRWV does not invalidate GOOG.
- Changing NVDA position data does not invalidate ELF.
- Editing Strategy A does not invalidate a ticker using only Strategy B.
- Editing one applicable strategy correctly invalidates combined results that
  include it.
- Portfolio-wide inputs invalidate only scores that actually consume them.

### Phase 6: Harden multi-strategy ordering invariants (not a defect fix)

Goal: keep combined scoring independent of storage order via regression coverage.
Ordering is already canonicalized; this phase adds asserts and tests only.

Preserve normalize, deduplicate, and sort of strategy IDs before:

- Merging strategies
- Creating revision hashes
- Creating cache keys
- Writing combined results
- Database validation
- Client readiness comparison

Also sort each stored definition-hash array.

Acceptance criteria:

- `[B, A]` produces the same identity and score as `[A, B]`.
- Reordering strategies in workspace JSON does not schedule new work.
- Two- and three-strategy holdings complete successfully.
- Removing or changing one strategy correctly replaces the combined result.

### Phase 7: Strengthen retry and recovery behavior

Goal: distinguish transient failure from permanent failure and recover without
user intervention.

Recommended behavior:

- Use bounded retries with backoff for network, provider, queue, and Edge
  Function failures.
- Permit a later market cycle to recover waiting or transiently failed runs.
- Detect processing leases that expire.
- Transition exhausted work to `failed`.
- Transition genuine input changes to `superseded`.
- Transition missing required data to `waiting_for_data` or `incomplete`.
- Do not repeatedly relabel permanent failures as generic pending.

### Phase 8: Persist authoritative notifications

Goal: make notifications use the exact inputs that produced the score.

Evaluate Layer 3 zones and notifications during the successful server-side
conviction check. Persist:

- Metric
- Timeframe
- Observed value
- Operator
- Threshold
- Pass/fail outcome
- Zone or notification label
- Cycle timestamp
- Scoring revision

The browser should render the persisted evaluation rather than recompute it
against a newer or different data set.

Behavior by state:

- `ready`: show persisted notifications.
- `scheduled`, `waiting_for_data`, `processing`, or `retrying`: do not emit new
  notifications.
- `failed`, `incomplete`, or `overdue`: show the scoring/data warning rather
  than silently implying that all rules passed.

### Phase 9: Enforce snapshot eligibility

Goal: preserve the current snapshot-integrity decision.

A score may enter a current snapshot only when:

- Run state is `ready`.
- Scoring revision matches the current scope.
- Result uses the intended cadence boundary.
- All required market data was complete.
- Result has not been superseded.

Never write a current snapshot from:

- Scheduled or pending work
- Waiting data
- Processing
- Retrying
- Stale
- Superseded
- Failed
- Incomplete
- Overdue

A prior valid score may remain in historical storage and may be shown as
explicitly historical context, but it must not be copied forward as today's
score.

### Phase 10: Add operational diagnostics

Recommended administrative visibility:

#### Symbol health

- Portfolio symbols
- Supabase subscription symbols
- Cloudflare registry/cache symbols
- Current manifest symbols
- Latest cycle symbols
- Missing symbols
- Orphaned symbols
- Subscription revision

#### Scoring health

- Scheduled runs
- Waiting-data runs
- Processing runs
- Retrying runs
- Failed runs
- Overdue runs
- Superseded runs
- Last successful check by strategy and cadence
- Queue backlog and dead-letter counts

#### Ticker explanations

Examples:

- `NVDA is waiting for the 1D check scheduled at 4:00 PM ET.`
- `CRWV was absent from the latest market cycle. Symbol reconciliation has
  been requested.`
- `CELH scoring failed after retries because required technical history was
  unavailable.`

## Testing requirements

### Unit tests

- Scoring revision remains stable for unrelated workspace changes.
- Scoring revision changes for actual scoring inputs.
- Scope-specific revisions do not invalidate unrelated tickers.
- Strategy ordering remains canonical (regression; already implemented).
- State transitions reject invalid paths.
- Snapshot eligibility excludes every non-ready state.
- Error categories map to the correct user presentation.

### Integration tests

- Portfolio save updates authoritative subscriptions.
- Cloudflare obtains the complete subscription snapshot.
- Adding several tickers sequentially does not lose prior registrations.
- Removing a ticker eventually removes it from collection when unused.
- A closed browser does not prevent synchronization.
- A missing ticker is detected and later recovers.
- An unrelated workspace save during scoring does not fail the run.
- A genuine strategy edit during scoring supersedes the run and schedules a
  replacement.
- Multi-strategy combined results succeed regardless of workspace order.
- Queue or Edge Function failures retry and eventually surface terminal state.
- Notifications are persisted from the same market cycle as conviction.

### End-to-end production smoke test

Use a controlled portfolio containing:

- A single-strategy ticker
- A multi-strategy ticker
- A newly added ticker
- A deliberately incomplete-data ticker

Verify:

1. Supabase subscription reconciliation
2. Cloudflare manifest inclusion
3. Market-cycle completion
4. Run-state progression
5. Current score publication
6. Notification persistence
7. Snapshot eligibility
8. Recovery without reopening the browser

For equivalent `1D` EMA rules and assignments, explicitly verify that GOOG and
NVDA produce equivalent rule outcomes from the same completed cycle.

## Backward-compatible rollout recommendation

Do not implement and deploy all phases as one indivisible change.

### Checkpoint 1: Visibility and immediate defects

- Add explicit failure and incomplete-state visibility.
- Add regression tests for already-canonical multi-strategy ordering.
- Add tests for existing behavior.
- Do not change production symbol authority yet.

### Checkpoint 2: Symbol authority

- Introduce the protected Supabase-derived symbol snapshot.
- Make Cloudflare consume it.
- Add reconciliation diagnostics.
- Run production reconciliation separately after verifying ownership and
  expected symbol sets.

### Checkpoint 3: Scoring revision reliability

- Introduce scoring-specific revisions.
- Preserve compatibility with existing rows during transition.
- Classify changed work as superseded.
- Narrow invalidation scope after revision correctness is demonstrated.

### Checkpoint 4: Notifications and UI

- Persist authoritative notification evaluations.
- Add the complete user-facing state model.
- Preserve snapshot restrictions.

### Checkpoint 5: Controlled production rollout

- Apply database migrations with an explicit rollback path.
- Deploy server components in dependency order.
- Reconcile symbols.
- Observe at least one complete cycle and relevant cadence processing.
- Confirm scores, warnings, notifications, and snapshots.

## Migration and compatibility considerations

The implementation plan should explicitly address:

- Whether new run states extend the existing status constraint or use a
  separate presentation/status table.
- How existing `pending`, `running`, `complete`, and `failed` rows map to the
  richer lifecycle.
- How scoring revisions are backfilled or introduced without treating all
  historical scores as current.
- Whether existing combined rows remain readable during rollout.
- How old clients behave while new server states are deployed.
- How to disable the new symbol feed and return to the existing registry if
  rollout validation fails.
- How to avoid modifying historical conviction snapshots.

## Risks and unresolved questions

The implementing agent must resolve these before deployment:

1. Does MO belong to another active user, or is it orphaned registry data?
2. Which portfolio and strategy scopes currently affect CRWV, CELH, and ACHR?
3. Which exact run failures are present in Supabase production history?
4. Are any failed runs currently in the dead-letter queue?
5. Should `waiting_for_data` remain a run status or be represented as a blocked
   reason on a scheduled run?
6. Which position and fill fields are truly consumed by scoring and therefore
   belong in each revision?
7. Which metrics require fundamentals or market context, and can the preflight
   compute requirements per strategy rather than requiring unused data?
8. What grace period defines an overdue check for each cadence?
9. Should prior valid scores be visible as historical context in the watch
   interface, or only in history views?
10. What is the source of truth for notification deduplication across retries?

## Recommended instructions for Cursor

Use this document first in Cursor Plan mode.

Cursor should:

1. Read the repository rules listed above.
2. Inspect the current implementation independently.
3. Confirm or challenge every finding in this document.
4. Clearly distinguish confirmed defects from hypotheses.
5. Produce a dependency-ordered plan with exact files and database objects.
6. Describe migrations, compatibility, rollback, tests, and production
   reconciliation.
7. Identify any simpler solution that preserves the product requirements.
8. Avoid implementation, migration, deployment, or production changes during
   the planning pass.

After the plan is reviewed, use Agent mode for one checkpoint at a time. Do not
instruct Cursor to execute this entire document autonomously in one pass.

## Definition of success

This effort is complete when:

- Every active portfolio ticker is automatically included in the required
  Cloudflare market cycles.
- Symbol synchronization self-heals without requiring the user to reopen the
  application.
- Score Pending represents only legitimate waiting or active work.
- Failed, incomplete, superseded, and overdue checks are clearly distinguished.
- Unrelated workspace saves cannot invalidate scoring.
- Relevant scoring changes still require a new current score.
- Multi-strategy results are independent of stored strategy order
  (already canonicalized; keep regression coverage).
- Notifications and conviction use the same authoritative completed cycle.
- Non-ready results never enter current snapshots.
- Production diagnostics can explain every non-ready ticker.

## CP0 evidence note (2026-07-28)

Branch: `bug/live-conviction-score-updates`.

Code re-verification on this branch confirmed the primary registry and
invalidation defects cited above. Multi-strategy ordering claim was corrected
in this document (Cursor + Codex agreement).

Production MO ownership and live CRWV/CELH/ACHR subscription diffs remain
read-only ops tasks before any prune: use Supabase
`market_symbol_subscriptions` vs Cloudflare KV `market:registry:*` vs the
latest published cycle symbol list. Do not delete MO from KV until its
`user_id` ownership is confirmed.

