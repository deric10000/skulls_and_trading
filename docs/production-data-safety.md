# Production Data Safety

## Purpose

This contract governs every Supabase migration, Edge Function release,
Cloudflare Worker release, queue change, binding change, backfill, data
normalization, and authoritative-storage transition in Skulls and Trading.

Its hard invariant is:

> Product evolution must not delete, reset, silently replace, orphan, or make
> inaccessible any user-owned fact. If preservation cannot be demonstrated,
> the production change must stop.

This includes portfolios, holdings, quantities, cash, transactions, fills,
portfolio and ticker history, imported history, custom strategies, strategy
versions, strategy applications, cadence and notification settings, user
preferences, archives, snapshots, scoring provenance, and future user-created
records. A product-approved deletion or retention-expiry flow is a separate
user-data lifecycle operation; it is not an acceptable side effect of a
deployment.

The product owner approves production actions and material tradeoffs. The
acting lead engineer/data architect owns the preservation design, migration
ordering, recovery plan, verification, and operational execution. The product
owner must never be handed routine migration commands to coordinate.

## Authority and classifications

Before implementation, classify every affected representation as one of:

- **Authoritative user data:** the only durable owner of a user-created fact.
- **Compatibility representation:** an older or alternate shape retained
  during a migration window.
- **Derived projection:** deterministically rebuildable from an authority.
- **Ephemeral cache:** disposable without losing a business fact.

Supabase Postgres behind RLS is the current authority for authenticated account
and financial state. Cloudflare KV market registries, cycle manifests, response
caches, and browser state are projections or caches unless a reviewed
architecture change explicitly promotes a different store. A cache or
projection must never become the only surviving copy of a user-owned fact by
accident.

Every proposal must list the authority, every writer, every reader, every
projection, and the reconstruction path. If two stores appear authoritative,
stop and resolve ownership before changing either.

## Non-negotiable preservation invariants

For every existing user, a release must preserve:

1. The identity and contents of every user-created portfolio and watchlist.
2. Holdings, fractional precision, average cost, cash, transaction ordering,
   transaction identity, and history without financial drift.
3. Default and custom strategy definitions, stable IDs, versions, assignments,
   ticker applications, portfolio applications, and effective dates.
4. Archives, undo/recovery state, historical records, and scoring provenance.
5. Unknown forward-compatible fields. JSON objects are merged or explicitly
   mapped; they are not reconstructed from a partial client model.
6. Tenant isolation. Migration or backfill code must retain `user_id` ownership
   and must not weaken RLS or cross account boundaries.
7. Current clients during rollout. The old and new application versions must
   remain compatible for the declared rollout window.

Counts alone are insufficient proof. Financial and strategy facts require a
canonical before/after comparison using stable identities and normalized
numeric precision. Generated timestamps, migration metadata, and explicitly
documented new defaults may differ; protected user facts may not.

## Expand, migrate, contract

Schema and storage evolution follows three separately reviewable phases:

1. **Expand:** add nullable columns, new tables, indexes, functions, versioned
   payload fields, or new bindings without removing or changing the existing
   contract. Old code must continue to work.
2. **Migrate:** copy or derive data with an idempotent, resumable, bounded
   backfill. Record progress and typed failures. Dual-read or dual-write only
   when the authority and conflict rule are explicit. Verify parity before
   cutover.
3. **Contract:** remove an old representation only in a later release after the
   compatibility window, production parity evidence, a restorable recovery
   point, and separate product-owner approval. Contracting must never remove
   the last copy of user data.

Do not combine destructive contraction with the release that introduces its
replacement. Once a migration has run in any shared or production environment,
do not edit it in place; add a forward migration.

## Supabase requirements

Every Supabase change must:

- Be represented by a timestamped migration checked into the repository. Keep
  local and remote migration history synchronized before adding new work, and
  keep the repository schema/bootstrap representation synchronized with the
  resulting schema.
- Treat broad `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, column rename, type
  narrowing, uniqueness changes, and function replacements that alter write
  behavior as destructive-risk operations requiring an explicit preservation
  design and later contract phase.
- Preserve unknown JSON fields when evolving `user_state`; never let a client
  or backfill serialize a partial model as a full replacement.
- Use transactions for coupled financial or strategy writes. A failure must
  leave the previous durable state intact.
- Make backfills safe to retry and safe to resume. Batch work by stable keys;
  never depend on browser uptime or an unrecorded cursor.
- Preserve RLS ownership and validate policies, grants, `security definer`
  search paths, and authenticated/anonymous denial after migration.
- Retain old normalized or compatibility data during rollback. Code rollback
  must disable new reads/writes without dropping newly collected records.
- Avoid logging row payloads, imported cells, strategy contents, or financial
  values during migration diagnostics. Operational evidence should use safe
  counts, opaque IDs, and invariant results.

Any rewrite, table replacement, destructive contract phase, or production
reconciliation requires a verified restorable recovery point before execution.
If the project tier cannot provide an appropriate managed restore point, create
and validate a scoped encrypted export using an approved secure location. Do
not place production exports in the repository, local logs, or ordinary
attachments.

## Cloudflare requirements

Every Cloudflare Worker, Queue, KV, Durable Object, D1, or R2 change must:

- Preserve binding names and resource identifiers unless a staged migration
  explicitly copies and verifies the old resource before cutover. Creating a
  new empty binding with the same logical purpose is not a migration.
- Keep Worker requests and payloads backward compatible across the database,
  Edge Function, queue producer, queue consumer, and currently deployed client.
  Version payloads when semantics change.
- Treat KV and cycle manifests as rebuildable projections when Supabase owns the
  facts. Cache deletion or expiry must affect availability/performance only,
  never user holdings, strategies, or history.
- Make queue consumers idempotent. Retries, duplicate delivery, timeout, and
  replay must not duplicate transactions, snapshots, or scoring results.
- Deploy producers only after compatible consumers exist; deploy consumers
  before producers when adding fields; remove compatibility only after all old
  messages and clients have aged out or been reconciled.
- Preserve environment-specific secrets, bindings, routes, cron triggers, and
  queue wiring. A deployment preview must show intended binding changes before
  production approval.
- Give any Cloudflare store promoted to authoritative status its own backup,
  migration, reconciliation, retention, and restore contract before it receives
  user-owned data.

A Worker rollback does not roll back Supabase schema or queued messages.
Rollback design must therefore be forward-compatible and must preserve data
written by the newer version.

## Required migration evidence

Every pull request that touches production persistence or deployment must
include a short data-safety manifest covering:

- Protected user facts and authoritative tables/stores
- Affected readers, writers, functions, queues, bindings, and projections
- Expansion, backfill/cutover, and any later contraction phases
- Backward-compatibility window and supported old/new version combinations
- Idempotency, concurrency, retry, partial-failure, and resume behavior
- Recovery point and rollback/roll-forward procedure
- Exact automated invariants and production verification queries
- Any destructive statements, why they are unavoidable, and the separate
  approval that gates them

Claims such as “additive,” “safe,” or “no data loss” require evidence; the SQL
shape alone is not proof.

## Verification gates

### Before production approval

1. Run the full existing-data migration from the oldest supported schema using
   fixtures that include multiple users, empty and populated portfolios,
   fractional holdings, cash, imports, custom strategies, strategy evolution,
   archives, and historical records.
2. Capture a canonical protected-data snapshot before and after. Assert exact
   identity, ownership, counts, values, ordering where meaningful, and numeric
   precision.
3. Test interrupted backfill, retry, duplicate delivery, stale client write,
   revision conflict, and rollback/roll-forward behavior.
4. Dry-run the linked migration and inspect the complete migration list. Only
   reviewed pending migrations may be applied.
5. Verify the application, Worker, Edge Function, and database contract in the
   intended deployment order.
6. Establish and validate the required recovery point for any operation that
   rewrites or removes data.

### Immediately after each production step

1. Confirm the expected migration/function/Worker version is active.
2. Run non-mutating schema, permission, binding, queue, and health probes.
3. Compare protected-data invariants to the pre-deploy baseline. Do not expose
   user values in output.
4. Smoke-test writes with a designated test account, never by modifying an
   ordinary user's portfolio.
5. Verify projections can reconcile from their authority and that pending work
   is progressing without duplicate effects.
6. Stop the rollout on count loss, ownership drift, financial drift, missing
   custom strategies, orphaned data, permission regression, incompatible
   payloads, or unexplained invariant changes.

## Recovery and rollback

Prefer roll-forward fixes for applied database migrations. Application,
Worker, or Edge Function rollback may be used only when the older version can
read data written by the newer version. Never “roll back” by dropping new
tables, clearing queues, purging KV namespaces, overwriting `user_state`, or
restoring a whole project without first reconciling writes made after the
recovery point.

Recovery procedures must name:

- The trigger and decision owner
- Which writes are paused, if any
- The authoritative recovery source
- How writes after the recovery point are captured and replayed
- How tenant ownership and financial precision are revalidated
- How the team proves the system is safe to reopen

If safe recovery is uncertain, stop writes to the affected operation while
leaving unaffected reads available. Preserve evidence and data first; restore
capability second.

## Completion standard

A persistence or infrastructure change is not complete because code merged or
a deploy command succeeded. It is complete only when:

- Protected user facts pass before/after conservation checks.
- New and old representations reconcile or the old representation remains
  safely retained.
- Security and tenant isolation pass.
- Background work and projections are healthy or visibly recoverable.
- Recovery steps are current and executable.
- Production actions and evidence are reported plainly to the product owner.
