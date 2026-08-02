-- Daily portfolio / strategy book marks (Open P&L sparkline + future book fields).
-- strategy_id '' = whole-book mark (same Current Watch totals universe).
create table if not exists public.portfolio_snapshots (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  strategy_id text not null default '',
  as_of date not null,
  holdings_market_value numeric not null,
  cost_basis numeric not null,
  cash_available numeric not null,
  total_value numeric not null,
  open_pnl numeric not null,
  open_pnl_pct numeric not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, portfolio_id, strategy_id, as_of)
);

alter table public.portfolio_snapshots enable row level security;

create policy "portfolio_snapshots_select_own"
  on public.portfolio_snapshots for select using (auth.uid() = user_id);
create policy "portfolio_snapshots_insert_own"
  on public.portfolio_snapshots for insert with check (auth.uid() = user_id);
create policy "portfolio_snapshots_update_own"
  on public.portfolio_snapshots for update using (auth.uid() = user_id);

grant select, insert, update on table public.portfolio_snapshots to authenticated;;
