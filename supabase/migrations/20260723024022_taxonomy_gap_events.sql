-- Append-only / upsert log of tickers missing a GICS sector+industry mapping
-- (live Yahoo strings absent or not normalized). Used to build a normalize list.
create table if not exists public.taxonomy_gap_events (
  id bigserial primary key,
  ticker text not null,
  reason text not null,
  yahoo_sector text,
  yahoo_industry text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  hit_count integer not null default 1 check (hit_count > 0),
  unique (ticker, reason)
);

alter table public.taxonomy_gap_events enable row level security;

create policy "taxonomy_gap_events_select_authenticated"
  on public.taxonomy_gap_events for select
  to authenticated
  using (true);

create policy "taxonomy_gap_events_insert_authenticated"
  on public.taxonomy_gap_events for insert
  to authenticated
  with check (true);

create policy "taxonomy_gap_events_update_authenticated"
  on public.taxonomy_gap_events for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on table public.taxonomy_gap_events to authenticated;
grant usage, select on sequence public.taxonomy_gap_events_id_seq to authenticated;
;
