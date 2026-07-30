# Engineering Autopilot

## Purpose

This document defines the default engineering operating model for Skulls and
Trading. It allows the user to remain the product owner and final approver while
Cursor or Codex owns the routine engineering process: investigation, impact
analysis, implementation planning, testing, verification, and clear handoff.

The goal is not to add ceremony to every change. The goal is to apply the right
amount of engineering discipline automatically, based on risk.

Agents must keep work proportional:

- Routine UI work should remain fast.
- Connected changes should include focused contract and integration checks.
- Critical data or infrastructure work should receive explicit reliability,
  migration, recovery, and production-safety planning.

The user should approve product intent, material tradeoffs, irreversible
changes, and production actions. The agent should not require the user to
micromanage ordinary engineering procedures.

## How this document is used

Before planning or implementing work, the active agent should:

1. Read the repository rules and references applicable to the requested
   surface.
2. Classify the task internally using the levels below.
3. Add the required checks to its plan automatically.
4. Execute approved, in-scope local work and verification without asking the
   user to coordinate every step.
5. Stop only at the approval boundaries defined in this document or in a more
   specific repository rule.

More specific repository rules override this general operating model when they
require stronger safeguards.

## Documentation ownership and routing

Agents should use progressive disclosure: load the short automatic rules first,
then read only the canonical references relevant to the requested work. Do not
load every long-form document for every task.

| Concern | Canonical owner | Read when |
| --- | --- | --- |
| Product purpose, audience, value, and principles | `product-vision.md` | Designing or changing a feature or product behavior |
| Product language, terminology, and tone | `product-voice.md` | Writing or changing user-facing copy |
| UX, interaction, accessibility, and visual system | `design-system.md` | Designing or changing user-facing UI |
| Sources of truth, state, persistence, providers, and scoring seams | `data-architecture.md` | Changing data shape, ownership, flow, persistence, scoring, or integrations |
| Performance limits and verification | `performance-budget.md` | Changing assets, loading, rendering, bundles, caching, or performance-sensitive paths |
| Strategy Forge behavior and scoring contract | `docs/strategy-forge.md` | Changing Forge authoring, scoring, cadence, statuses, or plan overlays |
| Security and identity boundary (invite-only auth, RLS, secrets, STOP list) | `.cursor/rules/security-hardening.mdc` | Changing auth, persistence of personal or financial data, secrets, or external account connections |
| Engineering risk, planning, verification, and approvals | `docs/engineering-autopilot.md` | Classifying and executing all repository work |
| Enforceable task-specific gates | `.cursor/rules/*.mdc` | Automatically, according to the affected surface (`AGENTS.md` is the Codex entry point, not a gate) |

Ownership rules:

- Each policy or contract should have one canonical owner.
- Automatic agent rules should route and enforce; they should not duplicate
  entire reference documents.
- Primary product, UX, architecture, and performance documents should remain
  focused on their own domains.
- Cross-references should be short and one-directional when possible.
- Update a canonical document only when the contract it owns actually changes.
- If documents conflict, follow the more specific enforceable repository rule
  and flag the canonical-document mismatch for correction in the same change.

## Creativity and intentional complexity

These rules protect product integrity; they do not prohibit novelty,
experimentation, or complexity.

Agents may propose new architectures, patterns, dependencies, interactions, or
capabilities when existing patterns are insufficient. The plan must explain:

- The user or system need
- Why the existing pattern is insufficient
- Benefits and tradeoffs
- Ownership and maintenance
- Migration and compatibility
- Failure and recovery behavior

Prefer intentional complexity over accidental complexity. Do not reject a
valuable feature merely because it is sophisticated; make its complexity
explicit, bounded, testable, and maintainable.

UI components and component states remain governed by
`.cursor/rules/design-governance.mdc`: a new component or state/variant ships
only when the user (or a plan the user explicitly confirmed) names that need.

## Extend established seams

When implementing a feature, extend the established architectural seam that
owns the behavior. Do not create a parallel data, state, persistence, or
business-logic path merely because it is faster locally.

Examples:

- Market and portfolio data flow through the established `DataSource` seam.
- Market Weather behavior flows through the weather modules, normalized
  taxonomy, and condition registry.
- Conviction flows through the pure Forge scoring engine.
- Account persistence flows through established repositories and authoritative
  server state.
- Scheduled work flows through the established run, queue, lease, and recovery
  model.

A new seam is allowed when existing boundaries genuinely cannot support the
requirement. Its authority, consumers, migration, verification, and retirement
of any replaced path must be explicit in the plan.

## Product-owner and agent responsibilities

### The user owns

- Product intent and priorities
- User experience and product-language decisions
- Approval of material scope or behavioral changes
- Approval of production migrations, production-data changes, and deployment
- Acceptance of meaningful risk or irreversible tradeoffs

### The agent owns

- Reading and following repository rules
- Inspecting the current implementation before changing it
- Identifying affected producers, consumers, and contracts
- Distinguishing evidence from hypotheses
- Creating a proportionate implementation plan
- Implementing the approved scope
- Adding or updating appropriate tests
- Running relevant verification
- Reviewing its final diff
- Reporting risks, uncertainties, and remaining production actions plainly

The agent should bring decisions to the user, not a list of routine engineering
chores.

## Task classification

The agent must classify each task before implementation. It may do this
silently unless the classification materially changes the plan or approval
requirements.

### Level 1 — Routine

Typical examples:

- Copy or label changes
- Styling and spacing
- Isolated component layout
- Ordinary explanatory documentation, release notes, or non-contractual notes
- Small, local UI behavior
- Test-fixture or mock-copy updates that do not alter a data contract

Required agent behavior:

- Follow the design system, product voice, and applicable component rules.
- Inspect the affected component and nearby tests.
- Run focused lint, type, test, or build validation as appropriate.
- Check the final diff for unrelated changes.
- Do not create unnecessary architecture documents or broad test suites.

### Level 2 — Connected

Typical examples:

- A shared component or hook
- A new API field
- A persisted preference
- Changes used by multiple screens
- New data-fetching behavior
- A calculation with several consumers
- A change to a shared client-side state contract
- Agent rules or engineering-governance documents
- Product-doctrine or product-voice contracts
- Design-system contracts
- Architecture references
- Performance policies

Required agent behavior, in addition to Level 1:

- Identify the authoritative source of truth.
- Identify affected producers and consumers.
- Inspect loading, empty, success, failure, and stale states.
- Check backward compatibility.
- Update relevant documentation when a contract or architecture changes.
- Add focused unit or integration tests for the changed contract.
- State any material assumptions in the plan.

### Level 3 — Critical

Typical examples:

- Authentication or authorization
- Financial calculations
- Conviction scoring or Strategy Forge data flow
- Market Weather scoring, taxonomy, provider normalization, or live-data flow
- Historical records or snapshots
- Database schema or migrations
- Queues, cron schedules, leases, or background jobs
- Caches, registries, denormalized projections, or duplicated state
- External API integration
- Notifications derived from server-side state
- Security or privacy behavior
- Deployment configuration
- Production-data reconciliation
- Documentation or rule changes that alter an actual security, data,
  persistence, scoring, historical-integrity, deployment, or production
  contract

Required agent behavior, in addition to Levels 1 and 2:

- Identify the authoritative owner of every important business fact.
- Identify caches, projections, denormalized copies, and external
  representations.
- Define how every derived representation is rebuilt or reconciled.
- Map asynchronous lifecycle and failure states where applicable.
- Check idempotency, concurrency, retry, timeout, lease, and terminal-failure
  behavior.
- Confirm how users distinguish waiting, processing, stale, incomplete,
  superseded, overdue, and failed states.
- Identify historical-data and snapshot invariants.
- Propose migration, compatibility, rollout, verification, and rollback.
- Add executable tests for critical invariants.
- Separate local implementation from migration, production reconciliation, and
  deployment.
- Require explicit approval at the production boundaries below.

## Evidence standard

Important findings must be classified as one of:

- **Confirmed by production evidence**
- **Confirmed by code**
- **Confirmed by automated test**
- **Hypothesis requiring verification**
- **Product recommendation**

An inference must not be presented as a confirmed defect.

If another review or the code contradicts an earlier finding, the agent must
correct the record rather than defend the earlier conclusion.

## Source-of-truth and projection rules

For Level 2 and Level 3 data work:

1. Every important business fact must have one declared authoritative owner.
2. Browser state, caches, KV values, indexes, manifests, normalized projections,
   and denormalized rows are not additional authorities unless explicitly
   designated.
3. Every derived representation must have:
   - A deterministic construction path
   - A way to detect drift
   - A rebuild or reconciliation path
   - Observable failure behavior
4. Server-side correctness must not require the browser to remain open.
5. Partial updates must not accidentally behave as full replacement.
6. Set and map identities must be canonicalized before hashing, caching, or
   comparison.
7. A general record timestamp must not be used as a domain revision when
   unrelated writes can change it.

If a proposed implementation creates a second source of truth, the agent must
raise that architectural decision before proceeding.

## Asynchronous-work rules

Scheduled or background workflows must explicitly address, where applicable:

- Scheduled or pending
- Waiting for required data
- Processing
- Retrying
- Ready or complete
- Stale
- Superseded
- Incomplete
- Overdue
- Failed

Additional requirements:

- Failure must not be represented as ordinary pending work.
- Every claimed operation must be idempotent or have a documented reason it
  cannot be.
- Retryable and terminal failures must be distinguishable.
- Timeouts and abandoned leases must recover automatically.
- Relevant input changes during processing should supersede obsolete work
  rather than commit outdated results.
- The user-facing state must reflect the actual operational state.
- Diagnostic data must explain why work is not ready.

## Data-completeness and historical-integrity rules

- Missing upstream data must not be fabricated.
- Partial input must not be silently treated as a complete successful result.
- Required inputs should be determined before expensive work begins.
- Missing inputs must produce a typed, observable reason.
- Historical values must not be presented as current without an explicit stale
  or historical label.
- Snapshot or history writes must define exact eligibility.
- Failed, incomplete, superseded, or stale results must not be written as
  current truth.
- Changes to historical-data behavior require migration, compatibility, and
  rollback planning.

## Plan requirements

Plans must remain proportional.

### Level 1 plan

The agent may use a short internal plan. It should tell the user the intended
outcome and report verification at completion.

### Level 2 plan

Include:

- Intended outcome
- Current behavior
- Affected files and consumers
- Important contract or state changes
- Implementation steps
- Tests and acceptance criteria
- Material assumptions or risks

### Level 3 plan

Include:

- Intended outcome and non-goals
- Applicable product value from `product-vision.md`
- Confirmed current behavior and evidence classification
- Authoritative sources and derived representations
- State lifecycle and failure behavior
- Important invariants
- Files, services, and database objects affected
- Migration and backward-compatibility approach
- Dependency-ordered implementation checkpoints
- Automated tests and acceptance criteria
- Reconciliation and recovery behavior
- Rollout, production verification, and rollback
- Actions requiring separate user approval
- Remaining hypotheses or unresolved decisions

An agent planning Level 3 work should challenge prior findings and identify
simpler solutions that preserve the requirements.

## Implementation rules

During approved implementation, the agent must:

- Work in reviewable checkpoints for Level 3 changes.
- Preserve existing product math and historical behavior unless explicitly
  authorized to change them.
- Avoid unrelated cleanup.
- Keep architecture documentation synchronized when required by repository
  rules.
- Add tests before claiming a critical invariant is protected.
- Run the relevant test, type, lint, build, performance, and locked-surface
  checks.
- Never weaken validation merely to make a test pass.
- Review the complete final diff, not only the last edited file.
- Report any verification that could not be performed.

## Approval boundaries

The agent may proceed autonomously with local, reversible, in-scope
implementation and testing after the user approves the plan or directly asks
for the change.

The agent must stop for explicit approval before:

- Applying a production database migration
- Mutating or reconciling production data
- Deploying to production
- Committing, merging, or pushing when required by the repository Git rules
- Deleting material data
- Changing authentication or authorization policy
- Introducing an irreversible compatibility break
- Changing a product formula or user-visible business rule
- Expanding materially beyond the approved product intent

A Level 3 implementation plan does not itself authorize production mutation or
deployment.

## Completion standard

Code being written is not sufficient for completion.

Before reporting an implementation complete, the agent must:

1. Run proportionate automated checks.
2. Verify affected success, loading, empty, stale, and failure states.
3. Confirm critical invariants remain intact.
4. Review the final diff for unrelated changes.
5. Identify migrations, deployment, or production verification still pending.
6. Report:
   - What changed
   - What was verified
   - What remains uncertain
   - What requires user approval

## Market Weather planning trigger

Changes to Market Weather are Level 3 when they affect any of:

- Scoring or condition selection
- Live provider inputs
- Market, sector, industry, or stock cascade behavior
- Yahoo-to-internal taxonomy mapping
- Taxonomy hydration or gap reporting
- Cache invalidation or live-cache revision domains
- Market-cycle payloads or cadence
- Snapshots or history
- Cross-account or production data

For those changes, the plan must additionally:

1. Read the Market Weather section of `data-architecture.md` and
   `.cursor/rules/data-architecture.mdc`.
2. Preserve the pure, provider-agnostic scoring boundary.
3. Identify the authoritative source for every market, sector, industry, and
   ticker reading.
4. Trace provider data through normalization, taxonomy, caching, DataSource,
   scoring, and UI consumers.
5. Confirm missing data remains `null` or an explicit review state, never a
   fabricated neutral value.
6. Verify changes do not unintentionally invalidate Forge conviction inputs.
7. Test taxonomy gaps, pending hydration, cache refresh, failure, and stale
   behavior.
8. Include performance-budget and locked-surface QA when applicable.
9. Separate implementation from any production provider, database, or
   deployment change.

Purely visual Market Weather changes may remain Level 1 or Level 2 if they do
not alter these data or scoring contracts.

## Recommended user interaction

The user should be able to work at the following altitude:

### Request

> Add or change this feature.

The agent classifies it and applies the appropriate engineering process.

### Higher-risk planning

> Investigate this, create a plan, and tell me which decisions require my
> approval.

The agent performs the technical due diligence and brings back decisions.

### Approved implementation

> Implement checkpoint one. Do not deploy.

The agent implements and verifies the checkpoint without requiring the user to
coordinate routine checks.

### Production handoff

> Prepare the rollout and tell me exactly what requires approval.

The agent separates migration, reconciliation, deployment, and verification
into explicit approval steps.

## Definition of successful autopilot

This operating model is working when:

- Routine product work remains fast.
- High-risk work automatically receives stronger planning and verification.
- The user approves intent and material risk rather than micromanaging process.
- Agents distinguish facts from hypotheses.
- Critical state has a single authority and recoverable projections.
- Failures are observable rather than hidden as generic pending states.
- Historical and financial integrity are protected by executable tests.
- Production actions remain deliberate and separately approved.
