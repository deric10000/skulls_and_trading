-- Current Watch edit/import foundations.
-- Local schema only until the product owner separately approves production migration.

create table if not exists public.portfolio_revisions (
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, portfolio_id)
);

create table if not exists public.portfolio_import_batches (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  mode text not null check (mode in ('append', 'replace')),
  status text not null default 'previewed'
    check (status in ('previewed', 'committed', 'rejected', 'reversed')),
  expected_revision integer not null check (expected_revision >= 0),
  replace_basis text check (replace_basis in ('history', 'opening')),
  opening_cash numeric(18, 2),
  opening_at timestamptz,
  opening_time_zone text,
  transaction_count integer not null default 0
    check (transaction_count between 0 and 5000),
  sanitization_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  primary key (user_id, id),
  check (
    (mode = 'append' and replace_basis is null and opening_cash is null
      and opening_at is null and opening_time_zone is null)
    or (mode = 'replace' and replace_basis = 'history' and opening_cash is null
      and opening_at is null and opening_time_zone is null)
    or (mode = 'replace' and replace_basis = 'opening' and opening_cash >= 0
      and opening_at is not null and opening_time_zone is not null)
  )
);

create table if not exists public.portfolio_transactions (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  kind text not null check (kind in ('qty', 'cash')),
  transaction_type text not null
    check (transaction_type in ('buy', 'sell', 'deposit', 'withdrawal')),
  ticker text,
  quantity numeric(24, 6),
  fill_price numeric(18, 2),
  amount numeric(18, 2),
  filled_at timestamptz not null,
  time_zone text not null,
  source text not null check (source in ('manual', 'import')),
  import_batch_id text,
  fingerprint text not null,
  shares_before numeric(24, 6),
  shares_after numeric(24, 6),
  cash_before numeric(18, 2),
  cash_after numeric(18, 2),
  action_class text,
  strategy_ids jsonb not null default '[]'::jsonb,
  zone_hints jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, import_batch_id)
    references public.portfolio_import_batches (user_id, id) on delete set null,
  check (
    (kind = 'qty' and ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'
      and quantity > 0 and fill_price > 0 and amount is null)
    or
    (kind = 'cash' and ticker is null and quantity is null
      and fill_price is null and amount > 0)
  )
);

create index if not exists portfolio_transactions_timeline_idx
  on public.portfolio_transactions (user_id, portfolio_id, filled_at, created_at);
create index if not exists portfolio_transactions_batch_idx
  on public.portfolio_transactions (user_id, import_batch_id);
create unique index if not exists portfolio_transactions_active_fingerprint_idx
  on public.portfolio_transactions (user_id, portfolio_id, fingerprint)
  where archived_at is null;

create table if not exists public.portfolio_archives (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  portfolio_snapshot jsonb not null,
  transaction_ids jsonb not null default '[]'::jsonb,
  reason text not null check (reason in ('portfolio_removed', 'replace_import', 'history_removed')),
  archived_at timestamptz not null default now(),
  purge_at timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz,
  permanently_deleted_at timestamptz,
  check (purge_at >= archived_at)
);

create table if not exists public.portfolio_ticker_history_archives (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  portfolio_id text not null,
  ticker text not null check (ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  transaction_ids jsonb not null default '[]'::jsonb,
  legacy_share_fills jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now(),
  purge_at timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz,
  check (purge_at >= archived_at)
);

create index if not exists portfolio_ticker_history_archives_active_idx
  on public.portfolio_ticker_history_archives (user_id, portfolio_id, ticker, archived_at desc)
  where restored_at is null;

drop index if exists public.portfolio_archives_active_idx;
create index portfolio_archives_active_idx
  on public.portfolio_archives (user_id, portfolio_id, archived_at desc)
  where restored_at is null and permanently_deleted_at is null;

create table if not exists public.strategy_versions (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  version integer not null check (version > 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, strategy_id, version),
  check (effective_to is null or effective_to > effective_from)
);

create table if not exists public.strategy_portfolio_application_episodes (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  portfolio_id text not null,
  strategy_version_id text,
  applied_at timestamptz not null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, strategy_version_id)
    references public.strategy_versions (user_id, id) on delete set null,
  check (removed_at is null or removed_at >= applied_at)
);

create unique index if not exists strategy_application_episode_active_idx
  on public.strategy_portfolio_application_episodes
    (user_id, strategy_id, portfolio_id)
  where removed_at is null;

alter table public.portfolio_revisions enable row level security;
alter table public.portfolio_import_batches enable row level security;
alter table public.portfolio_transactions enable row level security;
alter table public.portfolio_archives enable row level security;
alter table public.portfolio_ticker_history_archives enable row level security;
alter table public.strategy_versions enable row level security;
alter table public.strategy_portfolio_application_episodes enable row level security;

create policy "portfolio_revisions_own" on public.portfolio_revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "portfolio_import_batches_own" on public.portfolio_import_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "portfolio_transactions_own" on public.portfolio_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "portfolio_archives_own" on public.portfolio_archives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "portfolio_ticker_history_archives_own"
  on public.portfolio_ticker_history_archives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "strategy_versions_own" on public.strategy_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "strategy_application_episodes_own"
  on public.strategy_portfolio_application_episodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke insert, update, delete on table public.portfolio_revisions from authenticated;
revoke insert, update, delete on table public.portfolio_import_batches from authenticated;
revoke insert, update, delete on table public.portfolio_transactions from authenticated;
revoke insert, update, delete on table public.portfolio_archives from authenticated;
revoke insert, update, delete on table public.portfolio_ticker_history_archives from authenticated;
revoke insert, update, delete on table public.strategy_versions from authenticated;
revoke insert, update, delete on table public.strategy_portfolio_application_episodes from authenticated;
grant select on table public.portfolio_revisions to authenticated;
grant select on table public.portfolio_import_batches to authenticated;
grant select on table public.portfolio_transactions to authenticated;
grant select on table public.portfolio_archives to authenticated;
grant select on table public.portfolio_ticker_history_archives to authenticated;
grant select on table public.strategy_versions to authenticated;
grant select on table public.strategy_portfolio_application_episodes to authenticated;

create or replace function public.sync_portfolio_revisions_from_user_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source jsonb;
begin
  for source in
    select value from jsonb_array_elements(coalesce(new.portfolios, '[]'::jsonb)) rows(value)
  loop
    insert into public.portfolio_revisions (user_id, portfolio_id, revision)
    values (
      new.user_id,
      source->>'id',
      greatest(0, coalesce((source->>'revision')::integer, 0))
    )
    on conflict (user_id, portfolio_id) do update
      set revision = greatest(
        public.portfolio_revisions.revision,
        excluded.revision
      ),
      updated_at = now();
  end loop;
  return new;
end;
$$;

drop trigger if exists sync_portfolio_revisions_after_write on public.user_state;
create trigger sync_portfolio_revisions_after_write
after insert or update of portfolios on public.user_state
for each row execute function public.sync_portfolio_revisions_from_user_state();

revoke all on function public.sync_portfolio_revisions_from_user_state() from public;

-- Atomically updates the canonical portfolio projection and inserts its
-- normalized ledger. The function revalidates normalized JSON so the browser's
-- local sanitizer is never a trust boundary.
create or replace function public.commit_portfolio_transaction_batch(
  p_portfolio_id text,
  p_expected_revision integer,
  p_portfolio jsonb,
  p_transactions jsonb,
  p_batch jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  current_revision integer;
  next_revision integer;
  workspace_portfolios jsonb;
  tx jsonb;
  tx_count integer := jsonb_array_length(coalesce(p_transactions, '[]'::jsonb));
  batch_id text := nullif(p_batch->>'id', '');
  batch_mode text := p_batch->>'mode';
  prior_portfolio jsonb;
  prior_transaction_ids jsonb;
  running_cash numeric(18, 2);
  running_holdings jsonb;
  running_average_costs jsonb;
  current_shares numeric(24, 6);
  current_average_cost numeric;
  expected_shares numeric(24, 6);
  expected_average_cost numeric;
  expected_cash numeric(18, 2);
  trade_value numeric(18, 2);
  safe_report jsonb;
  existing_batch public.portfolio_import_batches%rowtype;
  opening_cash numeric(18, 2);
  opening_at timestamptz;
  opening_time_zone text;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if p_portfolio_id is null or p_portfolio->>'id' is distinct from p_portfolio_id then
    raise exception 'portfolio_mismatch';
  end if;
  if tx_count < 1 or tx_count > 5000 then raise exception 'invalid_transaction_count'; end if;
  if batch_id is null
    or batch_id !~ '^import-[A-Za-z0-9-]{8,80}$'
    or batch_mode not in ('append', 'replace') then
    raise exception 'invalid_batch';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text || ':' || batch_id, 0)
  );
  select * into existing_batch
  from public.portfolio_import_batches
  where user_id = caller and id = batch_id;
  if existing_batch.id is not null then
    if existing_batch.portfolio_id = p_portfolio_id
      and existing_batch.expected_revision = p_expected_revision
      and existing_batch.status = 'committed' then
      select revision into current_revision
      from public.portfolio_revisions
      where user_id = caller and portfolio_id = p_portfolio_id;
      return current_revision;
    end if;
    raise exception 'batch_identity_conflict';
  end if;

  insert into public.portfolio_revisions (user_id, portfolio_id, revision)
  values (caller, p_portfolio_id, coalesce(p_expected_revision, 0))
  on conflict (user_id, portfolio_id) do nothing;

  select revision into current_revision
  from public.portfolio_revisions
  where user_id = caller and portfolio_id = p_portfolio_id
  for update;
  if current_revision is distinct from p_expected_revision then
    raise exception 'portfolio_revision_conflict';
  end if;

  select portfolios into workspace_portfolios
  from public.user_state where user_id = caller for update;
  if workspace_portfolios is null or not exists (
    select 1 from jsonb_array_elements(workspace_portfolios) item
    where item->>'id' = p_portfolio_id
  ) then raise exception 'portfolio_not_found'; end if;

  select item into prior_portfolio
  from jsonb_array_elements(workspace_portfolios) item
  where item->>'id' = p_portfolio_id;
  if coalesce((prior_portfolio->>'revision')::integer, 0) <> p_expected_revision then
    raise exception 'portfolio_revision_conflict';
  end if;
  if prior_portfolio->>'type' <> 'portfolio'
    or p_portfolio->>'type' <> 'portfolio'
    or p_portfolio->>'label' is distinct from prior_portfolio->>'label'
    or p_portfolio->>'createdAt' is distinct from prior_portfolio->>'createdAt' then
    raise exception 'portfolio_identity_conflict';
  end if;

  if batch_mode = 'append' then
    running_cash := round(coalesce((prior_portfolio->>'cashAvailable')::numeric, 0), 2);
    select coalesce(jsonb_object_agg(holding->>'ticker', holding->'shares'), '{}'::jsonb)
    into running_holdings
    from jsonb_array_elements(coalesce(prior_portfolio->'holdings', '[]'::jsonb)) holding;
    select coalesce(jsonb_object_agg(holding->>'ticker', holding->'avgPrice'), '{}'::jsonb)
    into running_average_costs
    from jsonb_array_elements(coalesce(prior_portfolio->'holdings', '[]'::jsonb)) holding;
  else
    if p_batch->>'replaceBasis' not in ('history', 'opening') then
      raise exception 'invalid_replace_basis';
    end if;
    opening_cash := case when p_batch->>'replaceBasis' = 'opening'
      then round(coalesce((p_batch->>'openingCash')::numeric, 0), 2)
      else null end;
    running_cash := coalesce(opening_cash, 0);
    if running_cash < 0 then raise exception 'invalid_opening_cash'; end if;
    if p_batch->>'replaceBasis' = 'opening' then
      opening_at := nullif(p_batch->>'openingAt', '')::timestamptz;
      opening_time_zone := nullif(trim(p_batch->>'openingTimeZone'), '');
      if opening_at is null
        or opening_time_zone is null
        or not exists (
          select 1 from pg_catalog.pg_timezone_names
          where name = opening_time_zone
        ) then raise exception 'invalid_opening_boundary'; end if;
    end if;
    running_holdings := '{}'::jsonb;
    running_average_costs := '{}'::jsonb;
  end if;

  if (
    select count(distinct value->>'ticker')
    from jsonb_array_elements(p_transactions) rows(value)
    where value->>'kind' = 'qty'
  ) > 40 then raise exception 'ticker_limit_exceeded'; end if;

  for tx in
    select value
    from jsonb_array_elements(p_transactions) with ordinality rows(value, ordinality)
    order by (value->>'filledAt')::timestamptz, ordinality
  loop
    if tx->>'portfolioId' is distinct from p_portfolio_id
      or tx->>'kind' not in ('qty', 'cash')
      or tx->>'filledAt' is null
      or nullif(trim(tx->>'timeZone'), '') is null
      or length(tx->>'timeZone') > 64
      or not exists (
        select 1 from pg_catalog.pg_timezone_names
        where name = tx->>'timeZone'
      )
      or tx->>'id' !~ ('^' || batch_id || ':row:[0-9]{1,6}$') then
      raise exception 'invalid_transaction';
    end if;
    if opening_at is not null and (tx->>'filledAt')::timestamptz < opening_at then
      raise exception 'transaction_precedes_opening_boundary';
    end if;
    if tx->>'kind' = 'qty' then
      if tx->>'ticker' !~ '^[A-Z][A-Z0-9.-]{0,9}$'
        or coalesce((tx->>'deltaShares')::numeric, 0) <= 0
        or coalesce((tx->>'fillPrice')::numeric, 0) <= 0
        or tx->>'side' not in ('buy', 'sell')
        or tx->>'sharesBefore' is null
        or tx->>'sharesAfter' is null
        or tx->>'cashBefore' is null
        or tx->>'cashAfter' is null
      then raise exception 'invalid_qty_transaction'; end if;
      current_shares := round(coalesce((running_holdings->>(tx->>'ticker'))::numeric, 0), 6);
      current_average_cost := coalesce(
        (running_average_costs->>(tx->>'ticker'))::numeric,
        0
      );
      if round((tx->>'sharesBefore')::numeric, 6) <> current_shares then
        raise exception 'share_sequence_conflict';
      end if;
      expected_shares := round(
        current_shares + case when tx->>'side' = 'buy'
          then (tx->>'deltaShares')::numeric else -(tx->>'deltaShares')::numeric end,
        6
      );
      if expected_shares < 0 or round((tx->>'sharesAfter')::numeric, 6) <> expected_shares then
        raise exception 'invalid_share_math';
      end if;
      expected_average_cost := case
        when expected_shares <= 0 then 0
        when tx->>'side' = 'sell' then current_average_cost
        when current_shares <= 0 or current_average_cost <= 0
          then (tx->>'fillPrice')::numeric
        else (
          current_average_cost * current_shares +
          (tx->>'fillPrice')::numeric * (tx->>'deltaShares')::numeric
        ) / expected_shares
      end;
      trade_value := round((tx->>'deltaShares')::numeric * (tx->>'fillPrice')::numeric, 2);
      expected_cash := round(
        running_cash + case when tx->>'side' = 'sell' then trade_value else -trade_value end,
        2
      );
      if expected_cash < 0
        or round((tx->>'cashBefore')::numeric, 2) <> running_cash
        or round((tx->>'cashAfter')::numeric, 2) <> expected_cash
      then raise exception 'invalid_trade_cash_math'; end if;
      running_cash := expected_cash;
      running_holdings := jsonb_set(
        running_holdings,
        array[tx->>'ticker'],
        to_jsonb(expected_shares),
        true
      );
      running_average_costs := jsonb_set(
        running_average_costs,
        array[tx->>'ticker'],
        to_jsonb(expected_average_cost),
        true
      );
    else
      if abs(coalesce((tx->>'deltaCash')::numeric, 0)) <= 0
        or tx->>'cashBefore' is null
        or tx->>'cashAfter' is null then
        raise exception 'invalid_cash_transaction';
      end if;
      expected_cash := round(running_cash + (tx->>'deltaCash')::numeric, 2);
      if expected_cash < 0
        or round((tx->>'cashBefore')::numeric, 2) <> running_cash
        or round((tx->>'cashAfter')::numeric, 2) <> expected_cash
      then raise exception 'invalid_cash_math'; end if;
      running_cash := expected_cash;
    end if;
  end loop;

  if round(coalesce((p_portfolio->>'cashAvailable')::numeric, 0), 2) <> running_cash then
    raise exception 'portfolio_cash_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
    where holding->>'ticker' !~ '^[A-Z][A-Z0-9.-]{0,9}$'
      or coalesce((holding->>'shares')::numeric, -1) < 0
  ) or (
    select count(*)
    from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb))
  ) <> (
    select count(distinct holding->>'ticker')
    from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
  ) then raise exception 'invalid_portfolio_holdings'; end if;
  if exists (
    select 1 from jsonb_each_text(running_holdings) expected(ticker, shares)
    where round(shares::numeric, 6) <> coalesce((
      select round((holding->>'shares')::numeric, 6)
      from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
      where holding->>'ticker' = expected.ticker
    ), 0)
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
    where round((holding->>'shares')::numeric, 6) <> coalesce(
      round((running_holdings->>(holding->>'ticker'))::numeric, 6),
      0
    )
  ) then raise exception 'portfolio_holdings_mismatch'; end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
    where abs(
      coalesce((holding->>'avgPrice')::numeric, 0) -
      coalesce((running_average_costs->>(holding->>'ticker'))::numeric, 0)
    ) > 0.000001
  ) then raise exception 'portfolio_average_cost_mismatch'; end if;

  if (
    select count(distinct ticker)
    from (
      select holding->>'ticker' as ticker
      from jsonb_array_elements(workspace_portfolios) source
      cross join lateral jsonb_array_elements(
        coalesce(source->'holdings', '[]'::jsonb)
      ) holding
      where source->>'id' <> p_portfolio_id
      union all
      select holding->>'ticker'
      from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
    ) active_tickers
  ) > 40 then raise exception 'ticker_limit_exceeded'; end if;

  if batch_mode = 'replace' then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into prior_transaction_ids
    from public.portfolio_transactions
    where user_id = caller and portfolio_id = p_portfolio_id and archived_at is null;
    insert into public.portfolio_archives (
      user_id, portfolio_id, portfolio_snapshot, transaction_ids, reason
    ) values (
      caller,
      p_portfolio_id,
      jsonb_build_object(
        'portfolio', prior_portfolio,
        'legacyShareFills', coalesce((
          select jsonb_agg(item)
          from jsonb_array_elements((select share_fills from public.user_state where user_id = caller)) item
          where item->>'portfolioId' = p_portfolio_id
        ), '[]'::jsonb),
        'appliedStrategyIds', coalesce((
          select jsonb_agg(strategy->>'id')
          from jsonb_array_elements((select strategies from public.user_state where user_id = caller)) strategy
          where coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb) ? p_portfolio_id
        ), '[]'::jsonb)
      ),
      prior_transaction_ids,
      'replace_import'
    );
    update public.portfolio_transactions set archived_at = now()
    where user_id = caller and portfolio_id = p_portfolio_id and archived_at is null;
  end if;

  -- Persist counts only. Arbitrary report keys and raw import values never
  -- cross the normalized boundary into durable storage.
  safe_report := jsonb_build_object(
    'rowsReceived', least(5000, greatest(tx_count,
      coalesce((p_batch->'report'->>'rowsReceived')::integer, tx_count))),
    'rowsRetained', tx_count,
    'ignoredColumnCount', least(1000, greatest(0,
      coalesce((p_batch->'report'->>'ignoredColumnCount')::integer, 0))),
    'invalidRowCount', least(5000, greatest(0,
      coalesce((p_batch->'report'->>'invalidRowCount')::integer, 0))),
    'normalizedCellCount', least(5000, greatest(0,
      coalesce((p_batch->'report'->>'normalizedCellCount')::integer, 0))),
    'fractionalRowCount', least(tx_count, greatest(0,
      coalesce((p_batch->'report'->>'fractionalRowCount')::integer, 0))),
    'ambiguousTimeZoneCount', 0,
    'distinctTickerCount', (
      select count(distinct value->>'ticker')
      from jsonb_array_elements(p_transactions) rows(value)
      where value->>'kind' = 'qty'
    )
  );

  insert into public.portfolio_import_batches (
    id, user_id, portfolio_id, mode, status, expected_revision, replace_basis,
    opening_cash, opening_at, opening_time_zone, transaction_count,
    sanitization_report, committed_at
  ) values (
    batch_id, caller, p_portfolio_id, batch_mode, 'committed',
    p_expected_revision,
    case when batch_mode = 'replace' then p_batch->>'replaceBasis' end,
    opening_cash,
    opening_at, opening_time_zone, tx_count, safe_report, now()
  );

  insert into public.portfolio_transactions (
    id, user_id, portfolio_id, kind, transaction_type, ticker, quantity,
    fill_price, amount, filled_at, time_zone, source, import_batch_id,
    fingerprint, shares_before, shares_after, cash_before, cash_after,
    action_class, strategy_ids, zone_hints
  )
  select
    tx->>'id', caller, p_portfolio_id, tx->>'kind',
    case when tx->>'kind' = 'qty' then tx->>'side'
      when (tx->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end,
    nullif(tx->>'ticker', ''), nullif(tx->>'deltaShares', '')::numeric,
    nullif(tx->>'fillPrice', '')::numeric,
    case when tx->>'kind' = 'cash' then abs((tx->>'deltaCash')::numeric) end,
    (tx->>'filledAt')::timestamptz, tx->>'timeZone', 'import', batch_id,
    concat_ws(
      '|',
      p_portfolio_id,
      case when tx->>'kind' = 'qty' then tx->>'side'
        when (tx->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end,
      coalesce(tx->>'ticker', ''),
      trim(trailing '.' from trim(trailing '0' from
        round(coalesce(nullif(tx->>'deltaShares', '')::numeric, 0), 6)::text)),
      to_char(
        round(coalesce(nullif(tx->>'fillPrice', '')::numeric, 0), 2),
        'FM99999999999999999990.00'
      ),
      to_char(
        round(case when tx->>'kind' = 'cash'
          then abs((tx->>'deltaCash')::numeric) else 0 end, 2),
        'FM99999999999999999990.00'
      ),
      to_char(
        (tx->>'filledAt')::timestamptz at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    nullif(tx->>'sharesBefore', '')::numeric,
    nullif(tx->>'sharesAfter', '')::numeric, nullif(tx->>'cashBefore', '')::numeric,
    nullif(tx->>'cashAfter', '')::numeric,
    case when tx->>'kind' = 'cash'
      then case when (tx->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end
      when tx->>'side' = 'sell' and (tx->>'sharesAfter')::numeric = 0 then 'go_to_cash'
      when tx->>'side' = 'sell' then 'trim'
      else 'add' end,
    '[]'::jsonb, '[]'::jsonb
  from jsonb_array_elements(p_transactions) tx;

  next_revision := current_revision + 1;
  update public.portfolio_revisions set revision = next_revision, updated_at = now()
  where user_id = caller and portfolio_id = p_portfolio_id;
  p_portfolio := jsonb_set(p_portfolio, '{revision}', to_jsonb(next_revision), true);
  update public.user_state
  set portfolios = (
    select jsonb_agg(
      case when item->>'id' = p_portfolio_id then p_portfolio else item end
      order by ordinality
    )
    from jsonb_array_elements(workspace_portfolios) with ordinality rows(item, ordinality)
  ),
  share_fills = case when batch_mode = 'replace' then coalesce((
    select jsonb_agg(item order by ordinality)
    from jsonb_array_elements(share_fills) with ordinality rows(item, ordinality)
    where item->>'portfolioId' <> p_portfolio_id
  ), '[]'::jsonb) else share_fills end,
  updated_at = now()
  where user_id = caller;
  return next_revision;
end;
$$;

revoke all on function public.commit_portfolio_transaction_batch(text, integer, jsonb, jsonb, jsonb) from public;
grant execute on function public.commit_portfolio_transaction_batch(text, integer, jsonb, jsonb, jsonb) to authenticated;

-- Manual Edit Mode writes use a narrow RPC as well. Authenticated clients can
-- read normalized history, but cannot bypass these invariants with table DML.
create or replace function public.record_manual_portfolio_transactions(
  p_transactions jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  tx jsonb;
  workspace public.user_state%rowtype;
  normalized_kind text;
  normalized_type text;
  normalized_fingerprint text;
  normalized_strategy_ids jsonb;
  normalized_zone_hints jsonb;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if p_transactions is null
    or jsonb_typeof(p_transactions) <> 'array'
    or jsonb_array_length(p_transactions) < 1
    or jsonb_array_length(p_transactions) > 100 then
    raise exception 'invalid_transaction_count';
  end if;
  select * into workspace from public.user_state where user_id = caller;
  if workspace.user_id is null then raise exception 'workspace_not_found'; end if;

  for tx in select value from jsonb_array_elements(p_transactions) rows(value)
  loop
    normalized_kind := tx->>'kind';
    normalized_type := tx->>'transaction_type';
    if tx->>'id' !~ '^(fill|cash)-[0-9]+-[0-9]+$'
      or normalized_kind not in ('qty', 'cash')
      or normalized_type not in ('buy', 'sell', 'deposit', 'withdrawal')
      or not exists (
        select 1 from jsonb_array_elements(workspace.portfolios) portfolio
        where portfolio->>'id' = tx->>'portfolio_id'
      )
      or nullif(trim(tx->>'time_zone'), '') is null
      or not exists (
        select 1 from pg_catalog.pg_timezone_names
        where name = tx->>'time_zone'
      )
      or tx->>'filled_at' is null then
      raise exception 'invalid_manual_transaction';
    end if;

    if normalized_kind = 'qty' then
      if normalized_type not in ('buy', 'sell')
        or tx->>'ticker' !~ '^[A-Z][A-Z0-9.-]{0,9}$'
        or coalesce((tx->>'quantity')::numeric, 0) <= 0
        or coalesce((tx->>'fill_price')::numeric, 0) <= 0
        or tx->>'shares_before' is null or tx->>'shares_after' is null
        or tx->>'cash_before' is null or tx->>'cash_after' is null
        or round((tx->>'shares_after')::numeric, 6) <> round(
          (tx->>'shares_before')::numeric +
            case when normalized_type = 'buy' then (tx->>'quantity')::numeric
              else -(tx->>'quantity')::numeric end,
          6
        )
        or round((tx->>'cash_after')::numeric, 2) <> round(
          (tx->>'cash_before')::numeric +
            case when normalized_type = 'sell'
              then (tx->>'quantity')::numeric * (tx->>'fill_price')::numeric
              else -((tx->>'quantity')::numeric * (tx->>'fill_price')::numeric) end,
          2
        )
        or (tx->>'shares_after')::numeric < 0
        or (tx->>'cash_after')::numeric < 0 then
        raise exception 'invalid_manual_qty_math';
      end if;
    else
      if normalized_type not in ('deposit', 'withdrawal')
        or coalesce((tx->>'amount')::numeric, 0) <= 0
        or tx->>'cash_before' is null or tx->>'cash_after' is null
        or round((tx->>'cash_after')::numeric, 2) <> round(
          (tx->>'cash_before')::numeric +
            case when normalized_type = 'deposit' then (tx->>'amount')::numeric
              else -(tx->>'amount')::numeric end,
          2
        )
        or (tx->>'cash_after')::numeric < 0 then
        raise exception 'invalid_manual_cash_math';
      end if;
    end if;

    normalized_fingerprint := concat_ws(
      '|',
      tx->>'portfolio_id',
      normalized_type,
      case when normalized_kind = 'qty' then tx->>'ticker' else '' end,
      trim(trailing '.' from trim(trailing '0' from round(
        case when normalized_kind = 'qty' then (tx->>'quantity')::numeric else 0 end,
        6
      )::text)),
      to_char(round(case when normalized_kind = 'qty'
        then (tx->>'fill_price')::numeric else 0 end, 2),
        'FM99999999999999999990.00'),
      to_char(round(case when normalized_kind = 'cash'
        then (tx->>'amount')::numeric else 0 end, 2),
        'FM99999999999999999990.00'),
      to_char((tx->>'filled_at')::timestamptz at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into normalized_strategy_ids
    from jsonb_array_elements(coalesce(tx->'strategy_ids', '[]'::jsonb)) value
    where exists (
      select 1 from jsonb_array_elements(workspace.strategies) strategy
      where strategy->>'id' = value #>> '{}'
    );
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    into normalized_zone_hints
    from jsonb_array_elements(coalesce(tx->'zone_hints', '[]'::jsonb)) value
    where value #>> '{}' in ('Trim Zone', 'Add Zone', 'Go to Cash');

    insert into public.portfolio_transactions (
      id, user_id, portfolio_id, kind, transaction_type, ticker, quantity,
      fill_price, amount, filled_at, time_zone, source, import_batch_id,
      fingerprint, shares_before, shares_after, cash_before, cash_after,
      action_class, strategy_ids, zone_hints
    ) values (
      tx->>'id', caller, tx->>'portfolio_id', normalized_kind, normalized_type,
      case when normalized_kind = 'qty' then tx->>'ticker' end,
      case when normalized_kind = 'qty' then (tx->>'quantity')::numeric end,
      case when normalized_kind = 'qty' then (tx->>'fill_price')::numeric end,
      case when normalized_kind = 'cash' then (tx->>'amount')::numeric end,
      (tx->>'filled_at')::timestamptz, tx->>'time_zone', 'manual', null,
      normalized_fingerprint,
      nullif(tx->>'shares_before', '')::numeric,
      nullif(tx->>'shares_after', '')::numeric,
      (tx->>'cash_before')::numeric, (tx->>'cash_after')::numeric,
      case when normalized_kind = 'cash' then normalized_type
        when normalized_type = 'sell' and (tx->>'shares_after')::numeric = 0
          then 'go_to_cash'
        when normalized_type = 'sell' then 'trim'
        else 'add' end,
      normalized_strategy_ids, normalized_zone_hints
    ) on conflict (user_id, id) do nothing;
  end loop;
end;
$$;

revoke all on function public.record_manual_portfolio_transactions(jsonb) from public;
grant execute on function public.record_manual_portfolio_transactions(jsonb) to authenticated;

-- Normalize newly saved manual events only after the matching user_state
-- projection is durable. This keeps the compatibility blob and normalized
-- ledger atomic without making the browser coordinate two independent writes.
create or replace function public.normalize_manual_transactions_from_user_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidates jsonb;
begin
  if auth.uid() is distinct from new.user_id then return new; end if;
  select coalesce(jsonb_agg(candidate.row), '[]'::jsonb)
  into candidates
  from (
    select jsonb_build_object(
      'id', tx->>'id',
      'portfolio_id', tx->>'portfolioId',
      'kind', tx->>'kind',
      'transaction_type', case when tx->>'kind' = 'qty' then tx->>'side'
        when (tx->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end,
      'ticker', tx->>'ticker',
      'quantity', tx->'deltaShares',
      'fill_price', tx->'fillPrice',
      'amount', case when tx->>'kind' = 'cash'
        then to_jsonb(abs((tx->>'deltaCash')::numeric)) end,
      'filled_at', tx->>'filledAt',
      'time_zone', tx->>'timeZone',
      'shares_before', tx->'sharesBefore',
      'shares_after', tx->'sharesAfter',
      'cash_before', tx->'cashBefore',
      'cash_after', tx->'cashAfter',
      'strategy_ids', coalesce(tx->'strategyIds', '[]'::jsonb),
      'zone_hints', coalesce(tx->'zoneHints', '[]'::jsonb)
    ) as row
    from jsonb_array_elements(coalesce(new.share_fills, '[]'::jsonb)) tx
    where tx->>'kind' in ('qty', 'cash')
      and tx->>'id' ~ '^(fill|cash)-[0-9]+-[0-9]+$'
      and tx->>'source' <> 'import'
      and tx->>'portfolioId' is not null
      and tx->>'filledAt' is not null
      and tx->>'timeZone' is not null
      and tx->>'cashBefore' is not null
      and tx->>'cashAfter' is not null
      and not exists (
        select 1 from public.portfolio_transactions existing
        where existing.user_id = new.user_id and existing.id = tx->>'id'
      )
    limit 100
  ) candidate;
  if jsonb_array_length(candidates) > 0 then
    perform public.record_manual_portfolio_transactions(candidates);
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_manual_transactions_after_write on public.user_state;
create trigger normalize_manual_transactions_after_write
after insert or update of share_fills on public.user_state
for each row execute function public.normalize_manual_transactions_from_user_state();

revoke all on function public.normalize_manual_transactions_from_user_state() from public;

create or replace function public.archive_portfolio_source(
  p_portfolio_id text,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace public.user_state%rowtype;
  source jsonb;
  applied_ids jsonb;
  tx_ids jsonb;
  legacy_fills jsonb;
  archived public.portfolio_archives%rowtype;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  select * into workspace from public.user_state where user_id = caller for update;
  select item into source from jsonb_array_elements(workspace.portfolios) item
  where item->>'id' = p_portfolio_id;
  if source is null then raise exception 'portfolio_not_found'; end if;
  if coalesce((source->>'revision')::integer, 0) <> p_expected_revision then
    raise exception 'portfolio_revision_conflict';
  end if;
  select coalesce(jsonb_agg(strategy->>'id'), '[]'::jsonb) into applied_ids
  from jsonb_array_elements(workspace.strategies) strategy
  where coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb) ? p_portfolio_id;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into tx_ids
  from public.portfolio_transactions
  where user_id = caller and portfolio_id = p_portfolio_id and archived_at is null;

  insert into public.portfolio_archives (
    user_id, portfolio_id, portfolio_snapshot, transaction_ids, reason
  ) values (
    caller, p_portfolio_id,
    jsonb_build_object(
      'portfolio', source,
      'appliedStrategyIds', applied_ids,
      'legacyShareFills', coalesce((
        select jsonb_agg(item)
        from jsonb_array_elements(workspace.share_fills) item
        where item->>'portfolioId' = p_portfolio_id
      ), '[]'::jsonb)
    ),
    tx_ids, 'portfolio_removed'
  ) returning * into archived;

  update public.portfolio_transactions set archived_at = archived.archived_at
  where user_id = caller and portfolio_id = p_portfolio_id and archived_at is null;
  update public.user_state set
    portfolios = coalesce((
      select jsonb_agg(item order by ordinality)
      from jsonb_array_elements(workspace.portfolios) with ordinality rows(item, ordinality)
      where item->>'id' <> p_portfolio_id
    ), '[]'::jsonb),
    strategies = (
      select jsonb_agg(
        jsonb_set(
          strategy,
          '{appliedPortfolioIds}',
          coalesce((
            select jsonb_agg(value)
            from jsonb_array_elements(coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb)) value
            where value #>> '{}' <> p_portfolio_id
          ), '[]'::jsonb),
          true
        ) order by ordinality
      ) from jsonb_array_elements(workspace.strategies) with ordinality rows(strategy, ordinality)
    ),
    share_fills = coalesce((
      select jsonb_agg(item order by ordinality)
      from jsonb_array_elements(workspace.share_fills) with ordinality rows(item, ordinality)
      where item->>'portfolioId' <> p_portfolio_id
    ), '[]'::jsonb),
    updated_at = now()
  where user_id = caller;
  return jsonb_build_object(
    'archiveId', archived.id,
    'portfolio', source,
    'reason', archived.reason,
    'archivedAt', archived.archived_at,
    'purgeAt', archived.purge_at
  );
end;
$$;

create or replace function public.restore_portfolio_archive(p_archive_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace public.user_state%rowtype;
  archived public.portfolio_archives%rowtype;
  restored_portfolio jsonb;
  applied_ids jsonb;
  current_source jsonb;
  current_applied_ids jsonb;
  current_tx_ids jsonb;
  current_legacy jsonb;
  next_revision integer;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  select * into workspace from public.user_state where user_id = caller for update;
  select * into archived from public.portfolio_archives
  where user_id = caller and id = p_archive_id
    and restored_at is null and permanently_deleted_at is null and purge_at > now()
  for update;
  if archived.id is null then raise exception 'archive_not_found'; end if;
  restored_portfolio := archived.portfolio_snapshot->'portfolio';
  applied_ids := coalesce(archived.portfolio_snapshot->'appliedStrategyIds', '[]'::jsonb);

  select revision into next_revision
  from public.portfolio_revisions
  where user_id = caller and portfolio_id = archived.portfolio_id
  for update;
  next_revision := greatest(
    coalesce(next_revision, 0),
    coalesce((restored_portfolio->>'revision')::integer, 0)
  ) + 1;
  restored_portfolio := jsonb_set(
    restored_portfolio,
    '{revision}',
    to_jsonb(next_revision),
    true
  );
  insert into public.portfolio_revisions (user_id, portfolio_id, revision)
  values (caller, archived.portfolio_id, next_revision)
  on conflict (user_id, portfolio_id) do update
    set revision = excluded.revision, updated_at = now();

  select item into current_source from jsonb_array_elements(workspace.portfolios) item
  where item->>'id' = archived.portfolio_id;
  if current_source is not null then
    select coalesce(jsonb_agg(strategy->>'id'), '[]'::jsonb) into current_applied_ids
    from jsonb_array_elements(workspace.strategies) strategy
    where coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb) ? archived.portfolio_id;
    select coalesce(jsonb_agg(id), '[]'::jsonb) into current_tx_ids
    from public.portfolio_transactions
    where user_id = caller and portfolio_id = archived.portfolio_id and archived_at is null;
    select coalesce(jsonb_agg(item), '[]'::jsonb) into current_legacy
    from jsonb_array_elements(workspace.share_fills) item
    where item->>'portfolioId' = archived.portfolio_id;
    insert into public.portfolio_archives (
      user_id, portfolio_id, portfolio_snapshot, transaction_ids, reason
    ) values (
      caller,
      archived.portfolio_id,
      jsonb_build_object(
        'portfolio', current_source,
        'appliedStrategyIds', current_applied_ids,
        'legacyShareFills', current_legacy
      ),
      current_tx_ids,
      'replace_import'
    );
    update public.portfolio_transactions set archived_at = now()
    where user_id = caller and portfolio_id = archived.portfolio_id and archived_at is null;
  end if;

  update public.user_state set
    portfolios = case when current_source is null
      then workspace.portfolios || jsonb_build_array(restored_portfolio)
      else (
        select jsonb_agg(
          case when item->>'id' = archived.portfolio_id then restored_portfolio else item end
          order by ordinality
        ) from jsonb_array_elements(workspace.portfolios) with ordinality rows(item, ordinality)
      ) end,
    strategies = (
      select jsonb_agg(
        jsonb_set(
          strategy,
          '{appliedPortfolioIds}',
          coalesce((
            select jsonb_agg(value)
            from jsonb_array_elements(coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb)) value
            where value #>> '{}' <> archived.portfolio_id
          ), '[]'::jsonb) ||
            case when applied_ids ? (strategy->>'id')
              then to_jsonb(archived.portfolio_id) else '[]'::jsonb end,
          true
        ) order by ordinality
      ) from jsonb_array_elements(workspace.strategies) with ordinality rows(strategy, ordinality)
    ),
    share_fills = coalesce((
      select jsonb_agg(item order by ordinality)
      from jsonb_array_elements(workspace.share_fills) with ordinality rows(item, ordinality)
      where item->>'portfolioId' <> archived.portfolio_id
    ), '[]'::jsonb) || coalesce(archived.portfolio_snapshot->'legacyShareFills', '[]'::jsonb),
    updated_at = now()
  where user_id = caller;
  update public.portfolio_transactions set archived_at = null
  where user_id = caller and id in (
    select value #>> '{}' from jsonb_array_elements(archived.transaction_ids) value
  );
  update public.portfolio_archives set restored_at = now() where id = archived.id;
  return jsonb_build_object(
    'portfolio', restored_portfolio,
    'appliedStrategyIds', applied_ids,
    'sourcePortfolioId', archived.portfolio_id
  );
end;
$$;

create or replace function public.delete_portfolio_archive_permanently(p_archive_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  archived public.portfolio_archives%rowtype;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  select * into archived from public.portfolio_archives
  where user_id = caller and id = p_archive_id
    and restored_at is null and permanently_deleted_at is null
  for update;
  if archived.id is null then raise exception 'archive_not_found'; end if;
  delete from public.portfolio_transactions
  where user_id = caller and id in (
    select value #>> '{}' from jsonb_array_elements(archived.transaction_ids) value
  );
  delete from public.portfolio_archives where id = archived.id;
end;
$$;

revoke all on function public.archive_portfolio_source(text, integer) from public;
revoke all on function public.restore_portfolio_archive(bigint) from public;
revoke all on function public.delete_portfolio_archive_permanently(bigint) from public;
grant execute on function public.archive_portfolio_source(text, integer) to authenticated;
grant execute on function public.restore_portfolio_archive(bigint) to authenticated;
grant execute on function public.delete_portfolio_archive_permanently(bigint) to authenticated;

create or replace function public.archive_portfolio_ticker_history(
  p_portfolio_id text,
  p_ticker text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  normalized_ticker text := upper(trim(p_ticker));
  tx_ids jsonb;
  legacy_fills jsonb;
  archived public.portfolio_ticker_history_archives%rowtype;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if normalized_ticker !~ '^[A-Z][A-Z0-9.-]{0,9}$' then raise exception 'invalid_ticker'; end if;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into tx_ids
  from public.portfolio_transactions
  where user_id = caller and portfolio_id = p_portfolio_id
    and ticker = normalized_ticker and archived_at is null;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into legacy_fills
  from public.user_state workspace,
    jsonb_array_elements(workspace.share_fills) item
  where workspace.user_id = caller
    and item->>'portfolioId' = p_portfolio_id
    and upper(item->>'ticker') = normalized_ticker;
  insert into public.portfolio_ticker_history_archives (
    user_id, portfolio_id, ticker, transaction_ids, legacy_share_fills
  ) values (caller, p_portfolio_id, normalized_ticker, tx_ids, legacy_fills)
  returning * into archived;
  update public.portfolio_transactions set archived_at = archived.archived_at
  where user_id = caller and portfolio_id = p_portfolio_id
    and ticker = normalized_ticker and archived_at is null;
  update public.user_state set
    share_fills = coalesce((
      select jsonb_agg(item order by ordinality)
      from jsonb_array_elements(share_fills) with ordinality rows(item, ordinality)
      where not (
        item->>'portfolioId' = p_portfolio_id
        and upper(item->>'ticker') = normalized_ticker
      )
    ), '[]'::jsonb),
    updated_at = now()
  where user_id = caller;
  return jsonb_build_object(
    'archiveId', archived.id,
    'purgeAt', archived.purge_at
  );
end;
$$;

revoke all on function public.archive_portfolio_ticker_history(text, text) from public;
grant execute on function public.archive_portfolio_ticker_history(text, text) to authenticated;

create or replace function public.restore_portfolio_ticker_history(p_archive_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  archived public.portfolio_ticker_history_archives%rowtype;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  select * into archived from public.portfolio_ticker_history_archives
  where user_id = caller and id = p_archive_id
    and restored_at is null and purge_at > now()
  for update;
  if archived.id is null then raise exception 'archive_not_found'; end if;
  update public.portfolio_transactions set archived_at = null
  where user_id = caller and id in (
    select value #>> '{}' from jsonb_array_elements(archived.transaction_ids) value
  );
  update public.user_state
  set share_fills = share_fills || archived.legacy_share_fills,
    updated_at = now()
  where user_id = caller;
  update public.portfolio_ticker_history_archives
  set restored_at = now() where id = archived.id;
end;
$$;

revoke all on function public.restore_portfolio_ticker_history(bigint) from public;
grant execute on function public.restore_portfolio_ticker_history(bigint) to authenticated;

create or replace function public.record_strategy_evolution(
  p_previous jsonb,
  p_next jsonb,
  p_effective_at timestamptz default now()
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_strategy_id text := p_next->>'id';
  latest public.strategy_versions%rowtype;
  next_version integer;
  version_id text;
  v_portfolio_id text;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if v_strategy_id is null or v_strategy_id = '' then raise exception 'invalid_strategy'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(caller::text || ':' || v_strategy_id, 0)
  );

  select * into latest from public.strategy_versions
  where user_id = caller and strategy_id = v_strategy_id
    and effective_to is null
  order by version desc limit 1 for update;

  if latest.id is not null and latest.snapshot = p_next then
    version_id := latest.id;
  else
    next_version := coalesce(latest.version, 0) + 1;
    if latest.id is not null then
      update public.strategy_versions
      set effective_to = greatest(
        p_effective_at,
        latest.effective_from + interval '1 microsecond'
      ) where user_id = caller and id = latest.id;
    end if;
    version_id := v_strategy_id || ':v' || next_version::text || ':' ||
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    insert into public.strategy_versions (
      id, user_id, strategy_id, version, effective_from, snapshot
    ) values (
      version_id, caller, v_strategy_id, next_version, p_effective_at, p_next
    );
  end if;

  update public.strategy_portfolio_application_episodes
  set removed_at = p_effective_at
  where user_id = caller and strategy_id = v_strategy_id
    and removed_at is null
    and not (coalesce(p_next->'appliedPortfolioIds', '[]'::jsonb) ? portfolio_id);

  for v_portfolio_id in
    select value #>> '{}'
    from jsonb_array_elements(coalesce(p_next->'appliedPortfolioIds', '[]'::jsonb)) value
  loop
    if not exists (
      select 1 from public.strategy_portfolio_application_episodes
      where user_id = caller
        and strategy_id = v_strategy_id
        and portfolio_id = v_portfolio_id
        and removed_at is null
    ) then
      insert into public.strategy_portfolio_application_episodes (
        id, user_id, strategy_id, portfolio_id, strategy_version_id, applied_at
      ) values (
        v_strategy_id || ':' || v_portfolio_id || ':' ||
          floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
        caller, v_strategy_id, v_portfolio_id, version_id, p_effective_at
      );
    end if;
  end loop;
  return version_id;
end;
$$;

revoke all on function public.record_strategy_evolution(jsonb, jsonb, timestamptz) from public;
grant execute on function public.record_strategy_evolution(jsonb, jsonb, timestamptz) to authenticated;

create or replace function public.purge_expired_portfolio_archives()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.portfolio_transactions transaction
  where exists (
    select 1
    from public.portfolio_archives archive,
      jsonb_array_elements(archive.transaction_ids) transaction_id
    where archive.purge_at <= now()
      and archive.restored_at is null
      and archive.permanently_deleted_at is null
      and archive.user_id = transaction.user_id
      and transaction_id #>> '{}' = transaction.id
  );
  delete from public.portfolio_archives
  where purge_at <= now() and restored_at is null and permanently_deleted_at is null;
  get diagnostics purged = row_count;
  delete from public.portfolio_transactions transaction
  where exists (
    select 1
    from public.portfolio_ticker_history_archives archive,
      jsonb_array_elements(archive.transaction_ids) transaction_id
    where archive.purge_at <= now() and archive.restored_at is null
      and archive.user_id = transaction.user_id
      and transaction_id #>> '{}' = transaction.id
  );
  delete from public.portfolio_ticker_history_archives
  where purge_at <= now() and restored_at is null;
  return purged;
end;
$$;

revoke all on function public.purge_expired_portfolio_archives() from public;
grant execute on function public.purge_expired_portfolio_archives() to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'purge-expired-portfolio-archives'
  ) then
    perform cron.schedule(
      'purge-expired-portfolio-archives',
      '17 3 * * *',
      'select public.purge_expired_portfolio_archives()'
    );
  end if;
exception
  when insufficient_privilege or undefined_table or invalid_schema_name then
    raise notice 'pg_cron archive purge schedule requires Supabase cron support';
end
$$;
