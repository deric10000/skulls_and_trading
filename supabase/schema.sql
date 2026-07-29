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
  -- Hash of portfolios + strategies + share_fills only (not logs/flags/UI).
  scoring_revision text,
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
  portfolio_id text not null default '',
  strategy_id text not null,
  ticker text not null,
  as_of date not null,
  conviction numeric not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, portfolio_id, strategy_id, ticker, as_of)
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

-- Tickers missing a GICS sector+industry mapping (Yahoo absent or unmapped).
-- Upserted from the SPA so we can normalize aliases later.
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

-- Reliable Cadence Scoring. user_state remains authoritative; the following
-- normalized rows are rebuildable projections and idempotent derived results.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.market_symbol_subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 15),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create table if not exists public.strategy_check_schedules (
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  cadence text not null check (
    cadence in (
      '1h', '2h', '4h', '1D', '1W', '1M',
      'close-premarket', 'close-regular', 'close-afterhours', 'close-overnight'
    )
  ),
  next_due_at timestamptz not null default now(),
  enabled boolean not null default true,
  definition_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, strategy_id, cadence)
);
create index if not exists strategy_check_schedules_due_idx
  on public.strategy_check_schedules (next_due_at) where enabled;

create table if not exists public.strategy_check_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  cadence text not null,
  scheduled_for timestamptz not null,
  cycle_as_of timestamptz not null,
  cycle_key text not null,
  definition_hash text not null,
  workspace_updated_at timestamptz not null,
  scoring_revision text,
  status text not null default 'pending'
    check (status in (
      'pending', 'running', 'complete', 'failed',
      'superseded', 'waiting_for_data', 'incomplete', 'overdue'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  completed_at timestamptz,
  error text,
  error_category text,
  affected_tickers text[] not null default '{}'::text[],
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, strategy_id, cadence, scheduled_for)
);
create index if not exists strategy_check_runs_recovery_idx
  on public.strategy_check_runs (status, claimed_at)
  where status in (
    'pending', 'running', 'failed', 'waiting_for_data', 'incomplete', 'overdue'
  );

create table if not exists public.strategy_check_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  cadence text not null,
  last_run_id uuid references public.strategy_check_runs (id) on delete set null,
  last_cycle_as_of timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (user_id, strategy_id, cadence)
);

create table if not exists public.strategy_check_ticker_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  strategy_id text not null,
  ticker text not null,
  last_run_id uuid references public.strategy_check_runs (id) on delete set null,
  last_cycle_as_of timestamptz not null,
  last_checked_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, portfolio_id, strategy_id, ticker)
);

create table if not exists public.strategy_check_latest_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  strategy_id text not null,
  ticker text not null,
  run_id uuid not null references public.strategy_check_runs (id) on delete cascade,
  cycle_as_of timestamptz not null,
  definition_hash text not null,
  workspace_updated_at timestamptz not null,
  conviction numeric not null check (conviction between 0 and 100),
  status text,
  resolved jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, portfolio_id, strategy_id, ticker)
);

create table if not exists public.strategy_check_combined_latest_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  ticker text not null,
  strategy_ids text[] not null check (cardinality(strategy_ids) > 0),
  input_revision jsonb not null,
  run_id uuid not null references public.strategy_check_runs (id) on delete cascade,
  cycle_as_of timestamptz not null,
  cycle_key text not null,
  workspace_updated_at timestamptz not null,
  conviction numeric not null check (conviction between 0 and 100),
  status text,
  resolved jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, portfolio_id, ticker)
);

alter table public.forge_check_events
  add column if not exists run_id uuid references public.strategy_check_runs (id)
  on delete set null;
create unique index if not exists forge_check_events_run_scope_kind_key
  on public.forge_check_events (run_id, portfolio_id, ticker, kind)
  where run_id is not null;

alter table public.market_symbol_subscriptions enable row level security;
alter table public.strategy_check_schedules enable row level security;
alter table public.strategy_check_runs enable row level security;
alter table public.strategy_check_state enable row level security;
alter table public.strategy_check_ticker_state enable row level security;
alter table public.strategy_check_latest_results enable row level security;
alter table public.strategy_check_combined_latest_results enable row level security;

create policy "market_symbol_subscriptions_select_own"
  on public.market_symbol_subscriptions for select using (auth.uid() = user_id);
create policy "strategy_check_schedules_select_own"
  on public.strategy_check_schedules for select using (auth.uid() = user_id);
create policy "strategy_check_runs_select_own"
  on public.strategy_check_runs for select using (auth.uid() = user_id);
create policy "strategy_check_state_select_own"
  on public.strategy_check_state for select using (auth.uid() = user_id);
create policy "strategy_check_ticker_state_select_own"
  on public.strategy_check_ticker_state for select using (auth.uid() = user_id);
create policy "strategy_check_latest_results_select_own"
  on public.strategy_check_latest_results for select using (auth.uid() = user_id);
create policy "strategy_check_combined_latest_results_select_own"
  on public.strategy_check_combined_latest_results for select
  using (auth.uid() = user_id);

grant select on table public.market_symbol_subscriptions to authenticated;
grant select on table public.strategy_check_schedules to authenticated;
grant select on table public.strategy_check_runs to authenticated;
grant select on table public.strategy_check_state to authenticated;
grant select on table public.strategy_check_ticker_state to authenticated;
grant select on table public.strategy_check_latest_results to authenticated;
grant select on table public.strategy_check_combined_latest_results to authenticated;

create or replace function public.normalize_check_cadence(p_cadence text)
returns text language sql immutable set search_path = public
as $$
  select case
    when p_cadence in (
      '1h', '2h', '4h', '1D', '1W', '1M',
      'close-premarket', 'close-regular', 'close-afterhours', 'close-overnight'
    ) then p_cadence
    when p_cadence in ('15m', '30m') then '1h'
    else '1D'
  end
$$;

create or replace function public.refresh_scoring_projections(p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  workspace public.user_state%rowtype;
  symbol_count integer;
  global_symbol_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'market_symbol_subscriptions_global_cap', 0
  ));
  select * into workspace from public.user_state where user_id = p_user_id;
  if not found then
    delete from public.market_symbol_subscriptions where user_id = p_user_id;
    delete from public.strategy_check_schedules where user_id = p_user_id;
    return;
  end if;

  select count(distinct upper(trim(holding->>'ticker')))
  into symbol_count
  from jsonb_array_elements(workspace.portfolios) portfolio,
       jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) holding
  where upper(trim(holding->>'ticker')) ~ '^[A-Z^][A-Z0-9.^-]{0,14}$';

  if symbol_count > 40 then
    raise exception 'Market symbol subscription capacity exceeded (%/40)',
      symbol_count
      using errcode = 'check_violation';
  end if;

  with proposed as (
    select distinct upper(trim(holding->>'ticker')) as ticker
    from jsonb_array_elements(workspace.portfolios) portfolio,
         jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) holding
    where upper(trim(holding->>'ticker')) ~ '^[A-Z^][A-Z0-9.^-]{0,14}$'
  ),
  authoritative_symbols as (
    select ticker from public.market_symbol_subscriptions
    where active and user_id <> p_user_id
    union
    select ticker from proposed
  )
  select count(distinct ticker) into global_symbol_count
  from authoritative_symbols;
  if global_symbol_count > 800 then
    raise exception 'Global market symbol subscription capacity exceeded (%/800)',
      global_symbol_count
      using errcode = 'check_violation';
  end if;

  delete from public.market_symbol_subscriptions subscription
  where subscription.user_id = p_user_id
    and not exists (
      select 1
      from jsonb_array_elements(workspace.portfolios) portfolio,
           jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) holding
      where upper(trim(holding->>'ticker')) = subscription.ticker
    );

  insert into public.market_symbol_subscriptions (user_id, ticker, active, updated_at)
  select p_user_id, ticker, true, now()
  from (
    select distinct upper(trim(holding->>'ticker')) ticker
    from jsonb_array_elements(workspace.portfolios) portfolio,
         jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) holding
    where upper(trim(holding->>'ticker')) ~ '^[A-Z^][A-Z0-9.^-]{0,14}$'
  ) symbols
  order by ticker
  on conflict (user_id, ticker) do update
  set active = true, updated_at = excluded.updated_at;

  delete from public.strategy_check_schedules schedule
  where schedule.user_id = p_user_id
    and not exists (
      select 1
      from jsonb_array_elements(workspace.strategies) strategy
      cross join lateral (
        select public.normalize_check_cadence(strategy->>'checkInterval') cadence
        union
        select public.normalize_check_cadence(extra.value)
        from jsonb_array_elements_text(
          coalesce(strategy->'sessionCloseChecks', '[]'::jsonb)
        ) extra(value)
      ) intervals
      where strategy->>'id' = schedule.strategy_id
        and jsonb_array_length(
          coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb)
        ) > 0
        and intervals.cadence = schedule.cadence
    );

  insert into public.strategy_check_schedules (
    user_id, strategy_id, cadence, next_due_at,
    enabled, definition_hash, updated_at
  )
  select
    p_user_id,
    strategy->>'id',
    intervals.cadence,
    now(),
    true,
    public.strategy_definition_hash_v2(
      strategy,
      intervals.cadence,
      coalesce(workspace.portfolios, '[]'::jsonb),
      coalesce(workspace.share_fills, '[]'::jsonb)
    ),
    now()
  from jsonb_array_elements(workspace.strategies) strategy
  cross join lateral (
    select public.normalize_check_cadence(strategy->>'checkInterval') cadence
    union
    select public.normalize_check_cadence(extra.value)
    from jsonb_array_elements_text(
      coalesce(strategy->'sessionCloseChecks', '[]'::jsonb)
    ) extra(value)
  ) intervals
  where coalesce(strategy->>'id', '') <> ''
    and jsonb_array_length(
      coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb)
    ) > 0
  on conflict (user_id, strategy_id, cadence) do update
  set enabled = true,
      next_due_at = case
        when public.strategy_check_schedules.definition_hash
          is distinct from excluded.definition_hash
        then now()
        else public.strategy_check_schedules.next_due_at
      end,
      definition_hash = excluded.definition_hash,
      updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.refresh_scoring_projections(uuid) from public;
grant execute on function public.refresh_scoring_projections(uuid) to service_role;

create or replace function public.reconcile_strategy_first_check(p_strategy_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Not authenticated'; end if;
  perform public.refresh_scoring_projections(caller);
  update public.strategy_check_schedules
  set next_due_at = least(next_due_at, now()),
      updated_at = now()
  where user_id = caller and strategy_id = p_strategy_id;
end;
$$;
revoke all on function public.reconcile_strategy_first_check(text) from public;
grant execute on function public.reconcile_strategy_first_check(text)
  to authenticated;

create or replace function public.on_user_state_refresh_scoring_projections()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_scoring_projections(old.user_id);
    return old;
  end if;
  perform public.refresh_scoring_projections(new.user_id);
  return new;
end;
$$;
drop trigger if exists user_state_refresh_scoring_projections on public.user_state;
create trigger user_state_refresh_scoring_projections
  after insert or update of portfolios, strategies or delete on public.user_state
  for each row execute function public.on_user_state_refresh_scoring_projections();

drop function if exists public.claim_due_strategy_check_runs(timestamptz, text, integer);

create or replace function public.claim_due_strategy_check_runs(
  p_cycle_as_of timestamptz,
  p_cycle_key text,
  p_limit integer default 25
) returns table (
  run_id uuid,
  user_id uuid,
  strategy_id text,
  cadence text,
  scheduled_for timestamptz,
  definition_hash text,
  workspace_updated_at timestamptz,
  scoring_revision text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.strategy_check_runs (
    user_id, strategy_id, cadence, scheduled_for, cycle_as_of, cycle_key,
    definition_hash, workspace_updated_at, scoring_revision
  )
  select
    schedule.user_id, schedule.strategy_id, schedule.cadence,
    schedule.next_due_at, p_cycle_as_of, p_cycle_key,
    schedule.definition_hash, workspace.updated_at,
    coalesce(
      workspace.scoring_revision,
      public.compute_scoring_revision(
        coalesce(workspace.portfolios, '[]'::jsonb),
        coalesce(workspace.strategies, '[]'::jsonb),
        coalesce(workspace.share_fills, '[]'::jsonb)
      )
    )
  from public.strategy_check_schedules schedule
  join public.user_state workspace on workspace.user_id = schedule.user_id
  where schedule.enabled and schedule.next_due_at <= p_cycle_as_of
  on conflict (user_id, strategy_id, cadence, scheduled_for) do update
  set cycle_as_of = excluded.cycle_as_of,
      cycle_key = excluded.cycle_key,
      definition_hash = excluded.definition_hash,
      workspace_updated_at = excluded.workspace_updated_at,
      scoring_revision = excluded.scoring_revision,
      status = 'pending',
      claimed_at = null
  where public.strategy_check_runs.status in (
    'pending', 'failed', 'waiting_for_data', 'incomplete', 'overdue'
  );

  return query
  with claimable as (
    select run.id
    from public.strategy_check_runs run
    join public.strategy_check_schedules schedule
      on schedule.user_id = run.user_id
     and schedule.strategy_id = run.strategy_id
     and schedule.cadence = run.cadence
    join public.user_state workspace on workspace.user_id = run.user_id
    where run.cycle_key = p_cycle_key
      and run.definition_hash = schedule.definition_hash
      and coalesce(run.scoring_revision, '') = coalesce(
        workspace.scoring_revision,
        public.compute_scoring_revision(
          coalesce(workspace.portfolios, '[]'::jsonb),
          coalesce(workspace.strategies, '[]'::jsonb),
          coalesce(workspace.share_fills, '[]'::jsonb)
        ),
        ''
      )
      and (
        run.status = 'pending'
        or (
          run.status in ('failed', 'waiting_for_data', 'incomplete', 'overdue')
          and coalesce(run.completed_at, run.created_at) < now() - interval '5 minutes'
        )
        or (run.status = 'running' and run.claimed_at < now() - interval '10 minutes')
      )
    order by run.created_at, run.id
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ),
  claimed as (
    update public.strategy_check_runs run
    set status = 'running',
        attempt_count = run.attempt_count + 1,
        claimed_at = now(),
        error = null,
        error_category = null
    from claimable
    where run.id = claimable.id
    returning
      run.id, run.user_id, run.strategy_id, run.cadence, run.scheduled_for,
      run.definition_hash, run.workspace_updated_at, run.scoring_revision,
      run.attempt_count
  )
  select claimed.id, claimed.user_id, claimed.strategy_id,
         claimed.cadence, claimed.scheduled_for,
         claimed.definition_hash, claimed.workspace_updated_at,
         claimed.scoring_revision, claimed.attempt_count
  from claimed;
end;
$$;

revoke all on function public.claim_due_strategy_check_runs(timestamptz, text, integer)
  from public;
grant execute on function public.claim_due_strategy_check_runs(timestamptz, text, integer)
  to service_role;

drop function if exists public.complete_strategy_check_run(
  uuid, timestamptz, jsonb, jsonb, jsonb
);
create or replace function public.complete_strategy_check_run(
  p_run_id uuid,
  p_next_due_at timestamptz,
  p_results jsonb,
  p_portfolio_snapshots jsonb default '[]'::jsonb,
  p_events jsonb default '[]'::jsonb,
  p_combined_results jsonb default '[]'::jsonb,
  p_whole_book_snapshots jsonb default '[]'::jsonb
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  claimed public.strategy_check_runs%rowtype;
  current_scoring_revision text;
  current_definition_hash text;
begin
  select * into claimed from public.strategy_check_runs
  where id = p_run_id for update;
  if not found then raise exception 'Unknown strategy check run'; end if;
  if claimed.status = 'complete' then return false; end if;
  if claimed.status <> 'running' then
    raise exception 'Strategy check run is not claimed';
  end if;
  -- Only scoring-relevant revision invalidates completion (not logs/flags/UI).
  select coalesce(
    scoring_revision,
    public.compute_scoring_revision(
      coalesce(portfolios, '[]'::jsonb),
      coalesce(strategies, '[]'::jsonb),
      coalesce(share_fills, '[]'::jsonb)
    )
  ) into current_scoring_revision
  from public.user_state where user_id = claimed.user_id;
  select definition_hash into current_definition_hash
  from public.strategy_check_schedules
  where user_id = claimed.user_id
    and strategy_id = claimed.strategy_id
    and cadence = claimed.cadence;
  if (
        coalesce(claimed.scoring_revision, '') <> ''
        and current_scoring_revision is distinct from claimed.scoring_revision
      )
      or current_definition_hash is distinct from claimed.definition_hash then
    update public.strategy_check_runs
    set status = 'superseded',
        error = 'scoring_revision_mismatch',
        error_category = 'scoring_revision_mismatch',
        completed_at = now()
    where id = claimed.id
      and status = 'running';
    raise exception 'Strategy check run scoring revision is stale';
  end if;

  if coalesce(jsonb_array_length(p_results), 0) = 0
     and coalesce(jsonb_array_length(p_combined_results), 0) = 0 then
    update public.strategy_check_runs
    set status = 'incomplete',
        error = 'market_data_incomplete',
        error_category = 'market_data_incomplete',
        completed_at = now()
    where id = claimed.id;
    return false;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_combined_results, '[]'::jsonb)) as result(
      strategy_ids text[], input_revision jsonb
    )
    cross join lateral (
      select coalesce(
        jsonb_object_agg(revision.strategy_id, revision.hashes),
        '{}'::jsonb
      ) as value
      from (
        select schedule.strategy_id,
          jsonb_agg(distinct schedule.definition_hash order by schedule.definition_hash)
            as hashes
        from public.strategy_check_schedules schedule
        where schedule.user_id = claimed.user_id
          and schedule.strategy_id = any(result.strategy_ids)
        group by schedule.strategy_id
      ) revision
    ) expected
    where result.strategy_ids <> (
      select array_agg(id order by id) from unnest(result.strategy_ids) id
    )
       or cardinality(result.strategy_ids) <> jsonb_object_length(result.input_revision)
       or result.input_revision is distinct from expected.value
  ) then
    raise exception 'Combined result strategy-set revision is stale';
  end if;

  insert into public.strategy_check_latest_results (
    user_id, portfolio_id, strategy_id, ticker, run_id, cycle_as_of,
    definition_hash, workspace_updated_at,
    conviction, status, resolved, payload, updated_at
  )
  select
    claimed.user_id, result.portfolio_id,
    claimed.strategy_id, upper(result.ticker),
    claimed.id, claimed.cycle_as_of,
    claimed.definition_hash, claimed.workspace_updated_at,
    result.conviction, result.status,
    coalesce(result.resolved, '{}'::jsonb),
    coalesce(result.payload, '{}'::jsonb), now()
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as result(
    portfolio_id text, ticker text, conviction numeric,
    status text, resolved jsonb, payload jsonb
  )
  where coalesce(result.portfolio_id, '') <> ''
  on conflict (user_id, portfolio_id, strategy_id, ticker) do update
  set run_id = excluded.run_id,
      cycle_as_of = excluded.cycle_as_of,
      definition_hash = excluded.definition_hash,
      workspace_updated_at = excluded.workspace_updated_at,
      conviction = excluded.conviction,
      status = excluded.status,
      resolved = excluded.resolved,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  where public.strategy_check_latest_results.cycle_as_of <= excluded.cycle_as_of;

  insert into public.strategy_check_ticker_state (
    user_id, portfolio_id, strategy_id, ticker, last_run_id,
    last_cycle_as_of, last_checked_at, updated_at
  )
  select
    claimed.user_id, result.portfolio_id,
    claimed.strategy_id, upper(result.ticker),
    claimed.id, claimed.cycle_as_of, now(), now()
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb))
    as result(portfolio_id text, ticker text)
  where coalesce(result.portfolio_id, '') <> ''
  on conflict (user_id, portfolio_id, strategy_id, ticker) do update
  set last_run_id = excluded.last_run_id,
      last_cycle_as_of = excluded.last_cycle_as_of,
      last_checked_at = excluded.last_checked_at,
      updated_at = excluded.updated_at
  where public.strategy_check_ticker_state.last_cycle_as_of <= excluded.last_cycle_as_of;

  insert into public.conviction_snapshots (
    user_id, portfolio_id, strategy_id, ticker, as_of,
    conviction, status, payload
  )
  select
    claimed.user_id, result.portfolio_id,
    claimed.strategy_id, upper(result.ticker),
    (claimed.cycle_as_of at time zone 'America/New_York')::date,
    result.conviction, result.status,
    coalesce(result.payload, '{}'::jsonb) || jsonb_build_object(
      'runId', claimed.id, 'cycleKey', claimed.cycle_key
    )
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as result(
    portfolio_id text, ticker text, conviction numeric, status text, payload jsonb
  )
  where coalesce(result.portfolio_id, '') <> ''
  on conflict (user_id, portfolio_id, strategy_id, ticker, as_of) do update
  set conviction = excluded.conviction,
      status = excluded.status,
      payload = excluded.payload;

  insert into public.strategy_check_combined_latest_results (
    user_id, portfolio_id, ticker, strategy_ids, input_revision,
    run_id, cycle_as_of, cycle_key, workspace_updated_at,
    conviction, status, resolved, payload, updated_at
  )
  select
    claimed.user_id, result.portfolio_id, upper(result.ticker),
    result.strategy_ids, result.input_revision, claimed.id,
    claimed.cycle_as_of, claimed.cycle_key, claimed.workspace_updated_at,
    result.conviction, result.status,
    coalesce(result.resolved, '{}'::jsonb),
    coalesce(result.payload, '{}'::jsonb) || jsonb_build_object(
      'runId', claimed.id, 'cycleKey', claimed.cycle_key
    ),
    now()
  from jsonb_to_recordset(coalesce(p_combined_results, '[]'::jsonb)) as result(
    portfolio_id text, ticker text, strategy_ids text[], input_revision jsonb,
    conviction numeric, status text, resolved jsonb, payload jsonb
  )
  where coalesce(result.portfolio_id, '') <> ''
  on conflict (user_id, portfolio_id, ticker) do update
  set strategy_ids = excluded.strategy_ids,
      input_revision = excluded.input_revision,
      run_id = excluded.run_id,
      cycle_as_of = excluded.cycle_as_of,
      cycle_key = excluded.cycle_key,
      workspace_updated_at = excluded.workspace_updated_at,
      conviction = excluded.conviction,
      status = excluded.status,
      resolved = excluded.resolved,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  where public.strategy_check_combined_latest_results.cycle_as_of
    <= excluded.cycle_as_of;

  insert into public.portfolio_snapshots (
    user_id, portfolio_id, strategy_id, as_of,
    holdings_market_value, cost_basis, cash_available,
    total_value, open_pnl, open_pnl_pct, metrics
  )
  select
    claimed.user_id, snapshot.portfolio_id, claimed.strategy_id,
    (claimed.cycle_as_of at time zone 'America/New_York')::date,
    snapshot.holdings_market_value, snapshot.cost_basis,
    snapshot.cash_available, snapshot.total_value,
    snapshot.open_pnl, snapshot.open_pnl_pct,
    coalesce(snapshot.metrics, '{}'::jsonb) || jsonb_build_object(
      'runId', claimed.id, 'cycleKey', claimed.cycle_key
    )
  from jsonb_to_recordset(coalesce(p_portfolio_snapshots, '[]'::jsonb)) as snapshot(
    portfolio_id text, holdings_market_value numeric, cost_basis numeric,
    cash_available numeric, total_value numeric, open_pnl numeric,
    open_pnl_pct numeric, metrics jsonb
  )
  on conflict (user_id, portfolio_id, strategy_id, as_of) do update
  set holdings_market_value = excluded.holdings_market_value,
      cost_basis = excluded.cost_basis,
      cash_available = excluded.cash_available,
      total_value = excluded.total_value,
      open_pnl = excluded.open_pnl,
      open_pnl_pct = excluded.open_pnl_pct,
      metrics = excluded.metrics;

  insert into public.portfolio_snapshots (
    user_id, portfolio_id, strategy_id, as_of,
    holdings_market_value, cost_basis, cash_available,
    total_value, open_pnl, open_pnl_pct, metrics
  )
  select
    claimed.user_id, snapshot.portfolio_id, '',
    (claimed.cycle_as_of at time zone 'America/New_York')::date,
    snapshot.holdings_market_value, snapshot.cost_basis,
    snapshot.cash_available, snapshot.total_value,
    snapshot.open_pnl, snapshot.open_pnl_pct,
    coalesce(snapshot.metrics, '{}'::jsonb) || jsonb_build_object(
      'runId', claimed.id, 'cycleKey', claimed.cycle_key
    )
  from jsonb_to_recordset(coalesce(p_whole_book_snapshots, '[]'::jsonb)) as snapshot(
    portfolio_id text, holdings_market_value numeric, cost_basis numeric,
    cash_available numeric, total_value numeric, open_pnl numeric,
    open_pnl_pct numeric, metrics jsonb
  )
  on conflict (user_id, portfolio_id, strategy_id, as_of) do update
  set holdings_market_value = excluded.holdings_market_value,
      cost_basis = excluded.cost_basis,
      cash_available = excluded.cash_available,
      total_value = excluded.total_value,
      open_pnl = excluded.open_pnl,
      open_pnl_pct = excluded.open_pnl_pct,
      metrics = excluded.metrics;

  insert into public.forge_check_events (
    user_id, portfolio_id, strategy_id, ticker, run_id, checked_at,
    as_of, kind, primary_status, flags, conviction
  )
  select
    claimed.user_id, event.portfolio_id, claimed.strategy_id,
    upper(event.ticker), claimed.id, claimed.cycle_as_of,
    (claimed.cycle_as_of at time zone 'America/New_York')::date,
    event.kind, event.primary_status,
    coalesce(event.flags, '[]'::jsonb), event.conviction
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) as event(
    portfolio_id text, ticker text, kind text, primary_status text,
    flags jsonb, conviction numeric
  )
  on conflict (run_id, portfolio_id, ticker, kind)
    where run_id is not null do nothing;

  insert into public.strategy_check_state (
    user_id, strategy_id, cadence, last_run_id, last_cycle_as_of,
    last_success_at, last_error, updated_at
  )
  values (
    claimed.user_id, claimed.strategy_id, claimed.cadence, claimed.id,
    claimed.cycle_as_of, now(), null, now()
  )
  on conflict (user_id, strategy_id, cadence) do update
  set last_run_id = excluded.last_run_id,
      last_cycle_as_of = excluded.last_cycle_as_of,
      last_success_at = excluded.last_success_at,
      last_error = null,
      updated_at = excluded.updated_at
  where public.strategy_check_state.last_cycle_as_of is null
     or public.strategy_check_state.last_cycle_as_of <= excluded.last_cycle_as_of;

  update public.strategy_check_schedules
  set next_due_at = greatest(p_next_due_at, claimed.cycle_as_of + interval '1 minute'),
      updated_at = now()
  where user_id = claimed.user_id
    and strategy_id = claimed.strategy_id
    and cadence = claimed.cadence
    and next_due_at = claimed.scheduled_for;

  update public.strategy_check_runs
  set status = 'complete', completed_at = now(), error = null
  where id = claimed.id;
  return true;
end;
$$;
revoke all on function public.complete_strategy_check_run(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.complete_strategy_check_run(
  uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.fail_strategy_check_run(
  p_run_id uuid, p_error text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  failed public.strategy_check_runs%rowtype;
begin
  update public.strategy_check_runs
  set status = 'failed',
      error = left(coalesce(p_error, 'unknown failure'), 1000),
      completed_at = now()
  where id = p_run_id and status = 'running'
  returning * into failed;
  if found then
    insert into public.strategy_check_state (
      user_id, strategy_id, cadence, last_run_id, last_error, updated_at
    )
    values (
      failed.user_id, failed.strategy_id, failed.cadence,
      failed.id, failed.error, now()
    )
    on conflict (user_id, strategy_id, cadence) do update
    set last_run_id = excluded.last_run_id,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at;
  end if;
end;
$$;
revoke all on function public.fail_strategy_check_run(uuid, text) from public;
grant execute on function public.fail_strategy_check_run(uuid, text) to service_role;

create or replace function public.recover_due_conviction_cycles()
returns void language plpgsql security definer
set search_path = public, extensions
as $$
declare
  endpoint text;
  secret text;
begin
  select decrypted_secret into endpoint
  from vault.decrypted_secrets
  where name = 'conviction_cycle_function_url' limit 1;
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'conviction_cycle_internal_secret' limit 1;
  if endpoint is null or secret is null then return; end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-scoring-secret', secret
    ),
    body := '{"recovery":true}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.recover_due_conviction_cycles() from public;
grant execute on function public.recover_due_conviction_cycles() to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'recover-due-conviction-cycles'
  ) then
    perform cron.schedule(
      'recover-due-conviction-cycles',
      '*/5 * * * *',
      'select public.recover_due_conviction_cycles()'
    );
  end if;
exception
  when insufficient_privilege or undefined_table or invalid_schema_name then
    raise notice 'pg_cron recovery schedule requires Supabase cron/vault support';
end
$$;

select public.refresh_scoring_projections(user_id) from public.user_state;
