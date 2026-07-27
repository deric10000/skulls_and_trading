# Performance foundation verification — 2026-07-27

## Constraint result

- Visible UI, copy, markup, loading appearance, endpoints, providers,
  fallbacks, completeness gates, and cadence are unchanged.
- `src/lib/forge/scoring.ts` is unchanged.
- Forge golden verification passes, including conviction/status/assignment/
  apply-readiness invariants.

## Route evidence

Chrome desktop, live Worker before this branch (cache disabled):

- TTFB 139 ms; DOMContentLoaded/load 244 ms; FCP 380 ms
- 21 resources; 1,223,778 decoded bytes
- Google Fonts remained a third-party critical-path origin

Chrome desktop, local production preview after:

- Cold: TTFB 7 ms; DOMContentLoaded/load 67 ms; FCP 152 ms
- Warm: TTFB 5 ms; DOMContentLoaded/load 53 ms; FCP 164 ms
- 22 resources; 1,287,796 decoded bytes; zero third-party origins
- Auth timeline marks: app 66 ms, config/session 68–69 ms, auth-ready 70 ms

Chrome mobile emulation (390×844, DPR 3), local production preview after:

- Cold: TTFB 6 ms; DOMContentLoaded/load 69 ms; FCP 164 ms
- 22 resources; 1,189,382 decoded bytes; zero >50 ms long tasks
- Zero third-party origins

Local and live latency are not directly comparable. The live after-deploy pass
must repeat the exact cache-disabled and warm requests after this branch is
deployed; `_headers` cannot be verified on the existing live version before
deployment.

## Deterministic gates

- Production build: signed-out eager JS 208.4 KB gzip; authenticated Home
  additional JS 40.7 KB; CSS 22.5 KB gzip; fonts 106 KB.
- Scoring bridge fixture: 40 tickers, 2 applied strategies, 120 `scoreStock`
  calls/run, p95 9.24 ms.
- Unit suite: 90 tests across 16 files.
- Static initial route: 6 script/link requests and zero third-party origins.

## Root-cause attribution

The pure Forge engine is not the dominant measured cost: the Beta-cap bridge
p95 is under 9 ms. The larger risks were orchestration around it—global cache
invalidation and repeated alignment in render/snapshot/check-event paths—which
now use split revisions and a shared revision-keyed selector.

The free-tier upstream design is also not replaced: completed KV cycle remains
the steady-state source. Duplicate boot effects are gated, registry and cycle
waits overlap, and fallback counts are now measurable. No evidence in this
pass justifies changing providers, coverage, or scoring.

The later signed-in interaction freeze was cadence orchestration, not
`scoreStock`: `scheduler.ts` walked minute-by-minute through ET boundaries and
could repeat that work during one-second countdown renders. Bounded
`cadenceBoundaries.ts` arithmetic removes the walk while preserving every
1h/2h/4h/Daily/Weekly/Monthly and session-close wall, including DST, weekends,
and month-end.

## Offline cadence authority

- Completed hourly KV cycles are immutable and dispatch a reference through
  Cloudflare Queue to the Supabase Edge scorer. Due schedules are claimed and
  committed idempotently; `pg_cron` recovers missed dispatches/expired leases.
- Normalized RLS rows carry workspace/definition/cycle/run provenance.
  Multi-strategy names use the exact merged Forge strategy once—never averaged.
- The browser hydrates normalized results concurrently. `shadow` mode compares
  outputs; authoritative mode makes browser scheduling display/rollback-only.
- Adding a symbol still pulls one current quote and stays Score Pending until a
  matching completed server check. Untracked names remain outside Helm plan
  metrics while Current Watch whole-book P&L still includes them.
- Local maximum fixture: 20 users × 40 unique symbols × 5 strategies = 4,000
  ticker-strategy evaluations in 851.5 ms CPU; Queue forwarding p95 0.104 ms;
  72 normal Queue operations/day (192 if every message reaches DLQ). Hosted
  cold start, database/network time, and Queue delivery remain deployment-smoke
  gates before enabling server authority.
- Signed-in local development smoke: Home → Strategy Forge → Dashboard → Home
  all rendered and remained interactive; a 105-second idle countdown profile
  recorded zero >50 ms long tasks, confirming cadence no longer blocks the main
  thread. Route rendering in React development mode produced two isolated tasks
  (128 ms and 54 ms), not the prior repeated multi-second cadence freeze.

## Authenticated trace handoff

The harness stores no credentials. With a signed-in session, inspect
`performance.getEntriesByType("mark")` or `getPerformanceSummary()` from
`src/lib/performance/marks.ts` to capture profile/workspace/marks hydrate,
Home mount, market boot/cycle, alignment calls, Progress rows, persistence
bytes/duration, and long tasks.
