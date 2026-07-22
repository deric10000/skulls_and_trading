-- Beta 0 invite-only auth + per-user persistence (run in Supabase SQL editor).
-- RLS: each user only reads/writes their own rows.

create extension if not exists "pgcrypto";

-- Profiles (Admin Captain vs beta)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  captain_name text not null default 'Captain',
  role text not null default 'beta' check (role in ('admin', 'beta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- One-time invite codes (service role inserts; users redeem via RPC)
create table if not exists public.invite_codes (
  code text primary key,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users (id),
  redeemed_at timestamptz,
  note text
);

alter table public.invite_codes enable row level security;

-- No direct client access; redeem via security definer RPC only.
create policy "invite_admin_select"
  on public.invite_codes for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create or replace function public.redeem_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := upper(trim(p_code));
  row_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select code into row_id
  from public.invite_codes
  where code = normalized and redeemed_at is null
  for update;

  if row_id is null then
    return false;
  end if;

  update public.invite_codes
  set redeemed_by = auth.uid(), redeemed_at = now()
  where code = row_id;

  return true;
end;
$$;

revoke all on function public.redeem_invite_code(text) from public;
grant execute on function public.redeem_invite_code(text) to authenticated;

-- Validate invite before signup (anon may call; does not redeem)
create or replace function public.validate_invite_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := upper(trim(p_code));
begin
  return exists (
    select 1 from public.invite_codes
    where code = normalized and redeemed_at is null
  );
end;
$$;

revoke all on function public.validate_invite_code(text) from public;
grant execute on function public.validate_invite_code(text) to anon, authenticated;

-- Home + Forge workspace blob per user
create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  portfolios jsonb not null default '[]'::jsonb,
  strategies jsonb not null default '[]'::jsonb,
  chip_library jsonb not null default '[]'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  logs_by_ticker jsonb not null default '{}'::jsonb,
  captain jsonb not null default '{}'::jsonb,
  share_fills jsonb not null default '[]'::jsonb,
  -- One-shot per-user UI flags (e.g. onboardingSeen after the first-login
  -- Onboarding modal is dismissed). Small marker map, not workspace data.
  flags jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "user_state_select_own"
  on public.user_state for select using (auth.uid() = user_id);
create policy "user_state_insert_own"
  on public.user_state for insert with check (auth.uid() = user_id);
create policy "user_state_update_own"
  on public.user_state for update using (auth.uid() = user_id);

-- Daily conviction snapshots (append-only; charts later)
create table if not exists public.conviction_snapshots (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  ticker text not null,
  as_of date not null,
  conviction numeric not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, strategy_id, ticker, as_of)
);

alter table public.conviction_snapshots enable row level security;

create policy "snapshots_select_own"
  on public.conviction_snapshots for select using (auth.uid() = user_id);
create policy "snapshots_insert_own"
  on public.conviction_snapshots for insert with check (auth.uid() = user_id);
create policy "snapshots_update_own"
  on public.conviction_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

-- Latest per-account quote marks. These bridge local and deployed clients for
-- the same authenticated account; conviction still requires a check stamp.
create table if not exists public.ticker_marks (
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  last_price numeric not null check (last_price > 0),
  as_of timestamptz not null,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

alter table public.ticker_marks enable row level security;

create policy "ticker_marks_select_own"
  on public.ticker_marks for select using (auth.uid() = user_id);
create policy "ticker_marks_insert_own"
  on public.ticker_marks for insert with check (auth.uid() = user_id);
create policy "ticker_marks_update_own"
  on public.ticker_marks for update using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.user_state to authenticated;
grant select, insert, update on table public.conviction_snapshots to authenticated;
grant select, insert, update on table public.portfolio_snapshots to authenticated;
grant select, insert, update on table public.ticker_marks to authenticated;
-- bigserial nextval() for snapshot inserts (table INSERT alone is not enough)
grant usage, select on sequence public.conviction_snapshots_id_seq to authenticated;
grant usage, select on sequence public.portfolio_snapshots_id_seq to authenticated;
grant select on table public.invite_codes to authenticated;

-- Append-only Forge check / hold-inaction events (Plan Adherence).
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
grant usage, select on sequence public.forge_check_events_id_seq to authenticated;

-- Auto-create profile + empty user_state on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, captain_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'captain_name', 'Captain'),
    coalesce(new.raw_user_meta_data->>'role', 'beta')
  );
  insert into public.user_state (user_id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Seed helper: insert invite codes in SQL (admin):
-- insert into public.invite_codes (code, note) values ('BETA-XXXX', 'pilot');
-- Promote admin after first signup:
-- update public.profiles set role = 'admin' where email = 'you@example.com';
