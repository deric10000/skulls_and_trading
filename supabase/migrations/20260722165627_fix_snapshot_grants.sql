-- Snapshot writes need sequence USAGE for bigserial + UPDATE for upserts.
grant usage, select on sequence public.portfolio_snapshots_id_seq to authenticated;
grant usage, select on sequence public.conviction_snapshots_id_seq to authenticated;
grant update on table public.conviction_snapshots to authenticated;
-- Ensure table DML stays aligned with schema.sql (idempotent).
grant select, insert, update on table public.portfolio_snapshots to authenticated;
grant select, insert, update on table public.conviction_snapshots to authenticated;;
