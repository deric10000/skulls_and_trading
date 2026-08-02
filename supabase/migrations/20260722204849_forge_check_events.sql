-- Append-only Forge check / hold-inaction events for Plan Adherence.
create table if not exists public.forge_check_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  strategy_id text not null,
  ticker text not null,
  checked_at timestamptz not null,
  as_of date not null,
  kind text not null check (kind in ('status', 'hold')),
  primary_status text,
  flags jsonb not null default '[]'::jsonb,
  conviction numeric,
  created_at timestamptz not null default now()
);

create index if not exists forge_check_events_user_checked_idx
  on public.forge_check_events (user_id, checked_at desc);

create index if not exists forge_check_events_scope_idx
  on public.forge_check_events (user_id, portfolio_id, strategy_id, checked_at desc);

alter table public.forge_check_events enable row level security;

create policy "forge_check_events_select_own"
  on public.forge_check_events for select using (auth.uid() = user_id);
create policy "forge_check_events_insert_own"
  on public.forge_check_events for insert with check (auth.uid() = user_id);

grant select, insert on table public.forge_check_events to authenticated;
grant usage, select on sequence public.forge_check_events_id_seq to authenticated;;
