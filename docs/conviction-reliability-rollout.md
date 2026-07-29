# Conviction reliability rollout checklist

Branch: `bug/live-conviction-score-updates`

## Before production

1. Apply migration `supabase/migrations/20260729010000_conviction_reliability_states.sql`.
2. Deploy Edge `process-conviction-cycle` with preflight + scoring_revision handling.
3. Deploy Worker with registry `add|remove|replace` and optional
   `syncSubscriptionsSnapshot` (requires `SUPABASE_SERVICE_ROLE_KEY` +
   `SYMBOL_AUTHORITY=supabase`, rollback `kv_legacy`).
4. Ship client with Score Pending vs warning presentation.

## Live verification

1. Confirm portfolio holdings ⊆ `market_symbol_subscriptions`.
2. Confirm next published cycle includes CRWV/CELH/ACHR when subscribed.
3. Confirm MO ownership before any KV prune.
4. Observe one full hour cycle + due cadence processing.
5. Confirm failed/incomplete/superseded are not labeled Score Pending.
6. Confirm unrelated workspace saves do not supersede scoring runs.
7. Confirm GOOG/NVDA equivalent 1D EMA rules produce equivalent persisted
   `checkEvaluations` under matching assignments.

## Kill switches

- `SYMBOL_AUTHORITY=kv_legacy`
- Prior Edge/Worker bundles
- Client still treats unknown states as pending-like via `presentConvictionRun`
