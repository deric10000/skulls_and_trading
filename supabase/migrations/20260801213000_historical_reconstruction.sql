-- Checkpoint 6: truthful seven-day import reconstruction.
-- Additive only. Imported facts remain immutable; derived attribution is
-- written by leased service-role jobs and can be rebuilt from its evidence.

alter table public.portfolio_transactions
  add column if not exists reconstruction_status text,
  add column if not exists reconstruction_reason text,
  add column if not exists reconstruction_cycle_key text,
  add column if not exists reconstruction_cycle_as_of timestamptz,
  add column if not exists reconstructed_at timestamptz;

alter table public.portfolio_transactions
  drop constraint if exists portfolio_transactions_reconstruction_status_check;
alter table public.portfolio_transactions
  add constraint portfolio_transactions_reconstruction_status_check check (
    reconstruction_status is null or reconstruction_status in (
      'pending', 'scored', 'unscored', 'incomplete', 'skipped'
    )
  );

create table if not exists public.strategy_ticker_application_episodes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  strategy_id text not null,
  portfolio_id text not null,
  ticker text not null check (ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$'),
  applied_at timestamptz not null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  check (removed_at is null or removed_at >= applied_at)
);

create unique index if not exists strategy_ticker_episode_active_idx
  on public.strategy_ticker_application_episodes
    (user_id, strategy_id, portfolio_id, ticker)
  where removed_at is null;

create index if not exists strategy_ticker_episode_history_idx
  on public.strategy_ticker_application_episodes
    (user_id, portfolio_id, ticker, applied_at, removed_at);

create index if not exists strategy_version_history_idx
  on public.strategy_versions (user_id, effective_from, effective_to);

create index if not exists strategy_portfolio_episode_history_idx
  on public.strategy_portfolio_application_episodes
    (user_id, portfolio_id, applied_at, removed_at);

create table if not exists public.historical_reconstruction_jobs (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  import_batch_id text,
  source_kind text not null check (source_kind in ('import', 'manual')),
  transaction_ids jsonb not null default '[]'::jsonb,
  portfolio_id text not null,
  source_revision integer not null check (source_revision >= 0),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'retrying', 'complete', 'incomplete',
    'superseded', 'failed'
  )),
  score_window_start timestamptz not null,
  score_window_end timestamptz not null,
  basis_portfolio jsonb not null,
  working_portfolio jsonb not null,
  total_count integer not null check (total_count between 1 and 5000),
  processed_count integer not null default 0 check (processed_count >= 0),
  scored_count integer not null default 0 check (scored_count >= 0),
  unscored_count integer not null default 0 check (unscored_count >= 0),
  incomplete_count integer not null default 0 check (incomplete_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_claimed_at timestamptz,
  cursor_filled_at timestamptz,
  cursor_transaction_id text,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  last_error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, id),
  unique (user_id, import_batch_id),
  foreign key (user_id, import_batch_id)
    references public.portfolio_import_batches (user_id, id) on delete cascade,
  check (
    (source_kind = 'import' and import_batch_id is not null)
    or (source_kind = 'manual' and import_batch_id is null
      and jsonb_array_length(transaction_ids) between 1 and 100)
  ),
  check (score_window_end >= score_window_start),
  check (processed_count <= total_count),
  check (scored_count + unscored_count + incomplete_count + skipped_count <= processed_count)
);

create index if not exists historical_reconstruction_claim_idx
  on public.historical_reconstruction_jobs
    (status, next_retry_at, lease_expires_at, created_at)
  where status in ('queued', 'running', 'retrying');

create index if not exists historical_reconstruction_status_idx
  on public.historical_reconstruction_jobs
    (user_id, portfolio_id, created_at desc);

create table if not exists public.historical_transaction_reconstructions (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  transaction_id text not null,
  status text not null check (status in ('scored', 'unscored', 'incomplete', 'skipped')),
  reason text,
  cycle_key text,
  cycle_as_of timestamptz,
  strategy_ids jsonb not null default '[]'::jsonb,
  strategy_version_ids jsonb not null default '[]'::jsonb,
  zone_hints jsonb not null default '[]'::jsonb,
  alignment jsonb not null default '[]'::jsonb,
  reconstructed_at timestamptz not null default now(),
  primary key (user_id, job_id, transaction_id),
  foreign key (user_id, job_id)
    references public.historical_reconstruction_jobs (user_id, id) on delete cascade,
  foreign key (user_id, transaction_id)
    references public.portfolio_transactions (user_id, id) on delete cascade
);

alter table public.strategy_ticker_application_episodes enable row level security;
alter table public.historical_reconstruction_jobs enable row level security;
alter table public.historical_transaction_reconstructions enable row level security;

create policy "strategy_ticker_episodes_own"
  on public.strategy_ticker_application_episodes
  for select using (auth.uid() = user_id);
create policy "historical_reconstruction_jobs_own"
  on public.historical_reconstruction_jobs
  for select using (auth.uid() = user_id);
create policy "historical_transaction_reconstructions_own"
  on public.historical_transaction_reconstructions
  for select using (auth.uid() = user_id);

revoke insert, update, delete on table public.strategy_ticker_application_episodes
  from authenticated;
revoke insert, update, delete on table public.historical_reconstruction_jobs
  from authenticated;
revoke insert, update, delete on table public.historical_transaction_reconstructions
  from authenticated;
grant select on table public.strategy_ticker_application_episodes to authenticated;
grant select on table public.historical_reconstruction_jobs to authenticated;
grant select on table public.historical_transaction_reconstructions to authenticated;

-- Durable user_state is the authority for version/application boundaries. This
-- complements the client RPC and closes the gap when a tab closes before its
-- debounced history call runs.
create or replace function public.capture_workspace_history_for_user(
  p_user_id uuid,
  p_strategies jsonb,
  p_portfolios jsonb,
  p_effective_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  strategy jsonb;
  portfolio jsonb;
  holding jsonb;
  v_strategy_id text;
  v_portfolio_id text;
  ticker_id text;
  version_row public.strategy_versions%rowtype;
  version_id text;
  next_version integer;
  next_effective_from timestamptz;
begin
  for strategy in
    select value from jsonb_array_elements(coalesce(p_strategies, '[]'::jsonb)) rows(value)
  loop
    v_strategy_id := strategy->>'id';
    if coalesce(v_strategy_id, '') = '' then continue; end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_user_id::text || ':' || v_strategy_id, 0)
    );
    select * into version_row
    from public.strategy_versions
    where user_id = p_user_id and strategy_id = v_strategy_id
      and effective_to is null
    order by version desc limit 1 for update;
    if version_row.id is null or version_row.snapshot is distinct from strategy then
      next_version := coalesce(version_row.version, 0) + 1;
      next_effective_from := case when version_row.id is null
        then p_effective_at
        else greatest(
          p_effective_at,
          version_row.effective_from + interval '1 microsecond'
        ) end;
      if version_row.id is not null then
        update public.strategy_versions
        set effective_to = next_effective_from
        where user_id = p_user_id and id = version_row.id;
      end if;
      version_id := v_strategy_id || ':v' || next_version::text || ':' ||
        floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
      insert into public.strategy_versions (
        id, user_id, strategy_id, version, effective_from, snapshot
      ) values (
        version_id, p_user_id, v_strategy_id, next_version,
        next_effective_from,
        strategy
      );
    else
      version_id := version_row.id;
    end if;

    update public.strategy_portfolio_application_episodes episode
    set removed_at = greatest(p_effective_at, episode.applied_at)
    where episode.user_id = p_user_id and episode.strategy_id = v_strategy_id
      and episode.removed_at is null
      and not (coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb) ? episode.portfolio_id);
    for v_portfolio_id in
      select value #>> '{}'
      from jsonb_array_elements(coalesce(strategy->'appliedPortfolioIds', '[]'::jsonb)) rows(value)
    loop
      if not exists (
        select 1 from public.strategy_portfolio_application_episodes episode
        where episode.user_id = p_user_id
          and episode.strategy_id = v_strategy_id
          and episode.portfolio_id = v_portfolio_id
          and episode.removed_at is null
      ) then
        insert into public.strategy_portfolio_application_episodes (
          id, user_id, strategy_id, portfolio_id, strategy_version_id, applied_at
        ) values (
          v_strategy_id || ':' || v_portfolio_id || ':' ||
            floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
          p_user_id, v_strategy_id, v_portfolio_id, version_id, p_effective_at
        );
      end if;
    end loop;
  end loop;

  -- Close deleted strategies and their active scope episodes.
  update public.strategy_versions version
  set effective_to = greatest(p_effective_at, version.effective_from + interval '1 microsecond')
  where version.user_id = p_user_id and version.effective_to is null
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_strategies, '[]'::jsonb)) item
      where item->>'id' = version.strategy_id
    );
  update public.strategy_portfolio_application_episodes episode
  set removed_at = greatest(p_effective_at, episode.applied_at)
  where episode.user_id = p_user_id and episode.removed_at is null
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_strategies, '[]'::jsonb)) item
      where item->>'id' = episode.strategy_id
    );

  -- Explicit holding.strategyIds are authoritative for default-strategy ticker
  -- scope. Custom-strategy scope remains reconstructable from version exclusions.
  update public.strategy_ticker_application_episodes episode
  set removed_at = greatest(p_effective_at, episode.applied_at)
  where episode.user_id = p_user_id and episode.removed_at is null
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_portfolios, '[]'::jsonb)) source,
        jsonb_array_elements(coalesce(source->'holdings', '[]'::jsonb)) item,
        jsonb_array_elements_text(coalesce(item->'strategyIds', '[]'::jsonb)) assigned(id)
      where source->>'id' = episode.portfolio_id
        and upper(item->>'ticker') = episode.ticker
        and assigned.id = episode.strategy_id
    );
  for portfolio in
    select value from jsonb_array_elements(coalesce(p_portfolios, '[]'::jsonb)) rows(value)
  loop
    v_portfolio_id := portfolio->>'id';
    for holding in
      select value from jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) rows(value)
    loop
      ticker_id := upper(holding->>'ticker');
      for v_strategy_id in
        select value from jsonb_array_elements_text(coalesce(holding->'strategyIds', '[]'::jsonb)) rows(value)
      loop
        if ticker_id ~ '^[A-Z][A-Z0-9.-]{0,9}$' and not exists (
          select 1 from public.strategy_ticker_application_episodes episode
          where episode.user_id = p_user_id
            and episode.strategy_id = v_strategy_id
            and episode.portfolio_id = v_portfolio_id
            and episode.ticker = ticker_id
            and episode.removed_at is null
        ) then
          insert into public.strategy_ticker_application_episodes (
            user_id, strategy_id, portfolio_id, ticker, applied_at
          ) values (p_user_id, v_strategy_id, v_portfolio_id, ticker_id, p_effective_at);
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function public.capture_workspace_history_for_user(uuid, jsonb, jsonb, timestamptz)
  from public;

-- Preserve the existing browser RPC signature, but never trust a browser
-- timestamp or uncommitted strategy snapshot as historical authority.
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
  workspace public.user_state%rowtype;
  v_strategy_id text := p_next->>'id';
  version_id text;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if coalesce(v_strategy_id, '') = '' then raise exception 'invalid_strategy'; end if;
  select * into workspace from public.user_state where user_id = caller;
  if workspace.user_id is null or not exists (
    select 1 from jsonb_array_elements(coalesce(workspace.strategies, '[]'::jsonb)) item
    where item->>'id' = v_strategy_id
  ) then raise exception 'strategy_not_durable'; end if;
  perform public.capture_workspace_history_for_user(
    caller, workspace.strategies, workspace.portfolios, clock_timestamp()
  );
  select id into version_id from public.strategy_versions
  where user_id = caller and strategy_id = v_strategy_id
    and effective_to is null
  order by version desc limit 1;
  return version_id;
end;
$$;
revoke all on function public.record_strategy_evolution(jsonb, jsonb, timestamptz) from public;
grant execute on function public.record_strategy_evolution(jsonb, jsonb, timestamptz)
  to authenticated;

create or replace function public.capture_workspace_history_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    or old.strategies is distinct from new.strategies
    or old.portfolios is distinct from new.portfolios then
    perform public.capture_workspace_history_for_user(
      new.user_id, new.strategies, new.portfolios, clock_timestamp()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists capture_workspace_history_on_save on public.user_state;
create trigger capture_workspace_history_on_save
after insert or update of strategies, portfolios on public.user_state
for each row execute function public.capture_workspace_history_after_write();
revoke all on function public.capture_workspace_history_after_write() from public;

-- The batch row is inserted while the import RPC still holds the durable prior
-- portfolio. That is the deterministic replay boundary for append. Replace
-- starts from zero or the user-confirmed opening cash boundary.
create or replace function public.enqueue_historical_reconstruction_after_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source jsonb;
  basis jsonb;
  created_boundary timestamptz;
  window_end timestamptz := new.committed_at;
begin
  if new.status <> 'committed' or new.transaction_count < 1 then return new; end if;
  select item into source
  from public.user_state workspace,
    jsonb_array_elements(coalesce(workspace.portfolios, '[]'::jsonb)) item
  where workspace.user_id = new.user_id and item->>'id' = new.portfolio_id;
  if source is null then return new; end if;
  created_boundary := coalesce(nullif(source->>'createdAt', '')::timestamptz, window_end);
  basis := jsonb_build_object(
    'id', source->>'id',
    'label', 'Historical portfolio',
    'type', source->>'type',
    'createdAt', source->>'createdAt',
    'cashAvailable', case
      when new.mode = 'append' then coalesce((source->>'cashAvailable')::numeric, 0)
      when new.replace_basis = 'opening' then coalesce(new.opening_cash, 0)
      else 0 end,
    'holdings', case when new.mode = 'append' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'ticker', upper(holding->>'ticker'),
        'shares', coalesce((holding->>'shares')::numeric, 0),
        'avgPrice', coalesce((holding->>'avgPrice')::numeric, 0),
        'strategyIds', coalesce(holding->'strategyIds', '[]'::jsonb),
        'openPnlPct', 0, 'conviction', 0,
        'status', 'No Strategy', 'reason', 'Historical reconstruction pending.'
      ))
      from jsonb_array_elements(coalesce(source->'holdings', '[]'::jsonb)) holding
    ), '[]'::jsonb) else '[]'::jsonb end
  );
  insert into public.historical_reconstruction_jobs (
    id, user_id, import_batch_id, source_kind, transaction_ids,
    portfolio_id, source_revision,
    score_window_start, score_window_end, basis_portfolio, working_portfolio,
    total_count
  ) values (
    'history:' || new.id, new.user_id, new.id, 'import', '[]'::jsonb,
    new.portfolio_id,
    new.expected_revision + 1,
    greatest(window_end - interval '7 days', created_boundary), window_end,
    basis, basis, new.transaction_count
  ) on conflict (user_id, import_batch_id) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_historical_reconstruction_on_import
  on public.portfolio_import_batches;
create trigger enqueue_historical_reconstruction_on_import
after insert on public.portfolio_import_batches
for each row execute function public.enqueue_historical_reconstruction_after_import();
revoke all on function public.enqueue_historical_reconstruction_after_import() from public;

-- Manual rows older than the active 15-minute Current Watch session are
-- historical too. This trigger runs alphabetically after the existing
-- normalization trigger and captures OLD as the deterministic replay basis.
create or replace function public.enqueue_manual_historical_reconstruction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_portfolio_id text;
  tx_ids jsonb;
  source jsonb;
  basis jsonb;
  boundary timestamptz;
  v_revision integer;
begin
  for v_portfolio_id in
    select distinct item->>'portfolioId'
    from jsonb_array_elements(coalesce(new.share_fills, '[]'::jsonb)) item
    where item->>'source' <> 'import'
      and item->>'kind' in ('qty', 'cash')
      and (item->>'filledAt')::timestamptz < now() - interval '15 minutes'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(old.share_fills, '[]'::jsonb)) prior
        where prior->>'id' = item->>'id'
      )
  loop
    select jsonb_agg(item->>'id' order by (item->>'filledAt')::timestamptz, item->>'id')
    into tx_ids
    from jsonb_array_elements(coalesce(new.share_fills, '[]'::jsonb)) item
    where item->>'portfolioId' = v_portfolio_id
      and item->>'source' <> 'import'
      and item->>'kind' in ('qty', 'cash')
      and (item->>'filledAt')::timestamptz < now() - interval '15 minutes'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(old.share_fills, '[]'::jsonb)) prior
        where prior->>'id' = item->>'id'
      );
    select item into source from jsonb_array_elements(coalesce(old.portfolios, '[]'::jsonb)) item
    where item->>'id' = v_portfolio_id;
    if source is null or jsonb_array_length(coalesce(tx_ids, '[]'::jsonb)) = 0 then
      continue;
    end if;
    boundary := coalesce(nullif(source->>'createdAt', '')::timestamptz, now());
    select coalesce((item->>'revision')::integer, 0) into v_revision
    from jsonb_array_elements(coalesce(new.portfolios, '[]'::jsonb)) item
    where item->>'id' = v_portfolio_id;
    basis := jsonb_build_object(
      'id', source->>'id', 'label', 'Historical portfolio', 'type', source->>'type',
      'createdAt', source->>'createdAt',
      'cashAvailable', coalesce((source->>'cashAvailable')::numeric, 0),
      'holdings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ticker', upper(holding->>'ticker'),
          'shares', coalesce((holding->>'shares')::numeric, 0),
          'avgPrice', coalesce((holding->>'avgPrice')::numeric, 0),
          'strategyIds', coalesce(holding->'strategyIds', '[]'::jsonb),
          'openPnlPct', 0, 'conviction', 0,
          'status', 'No Strategy', 'reason', 'Historical reconstruction pending.'
        )) from jsonb_array_elements(coalesce(source->'holdings', '[]'::jsonb)) holding
      ), '[]'::jsonb)
    );
    insert into public.historical_reconstruction_jobs (
      id, user_id, import_batch_id, source_kind, transaction_ids,
      portfolio_id, source_revision, score_window_start, score_window_end,
      basis_portfolio, working_portfolio, total_count
    ) values (
      'history:manual:' || v_portfolio_id || ':' || pg_catalog.md5(tx_ids::text),
      new.user_id, null, 'manual', tx_ids, v_portfolio_id, v_revision,
      greatest(now() - interval '7 days', boundary), now(), basis, basis,
      jsonb_array_length(tx_ids)
    ) on conflict (user_id, id) do nothing;
    update public.portfolio_transactions tx set reconstruction_status = 'pending'
    where tx.user_id = new.user_id and tx.id in (
      select value #>> '{}' from jsonb_array_elements(tx_ids) value
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists queue_manual_historical_reconstruction_after_write
  on public.user_state;
create trigger queue_manual_historical_reconstruction_after_write
after update of share_fills on public.user_state
for each row execute function public.enqueue_manual_historical_reconstruction();
revoke all on function public.enqueue_manual_historical_reconstruction() from public;

create or replace function public.claim_historical_reconstruction_job(
  p_lease_seconds integer default 180
) returns setof public.historical_reconstruction_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select job.user_id, job.id
    from public.historical_reconstruction_jobs job
    where (
      job.status = 'queued'
      or (job.status = 'retrying' and coalesce(job.next_retry_at, now()) <= now())
      or (job.status = 'running' and job.lease_expires_at < now())
    )
    order by coalesce(job.last_claimed_at, job.created_at), job.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.historical_reconstruction_jobs job
    set status = 'running',
      attempt_count = job.attempt_count + 1,
      last_claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => least(600, greatest(30, p_lease_seconds))),
      next_retry_at = null,
      updated_at = now()
    from claimable
    where job.user_id = claimable.user_id and job.id = claimable.id
    returning job.*
  ) select * from claimed;
end;
$$;
revoke all on function public.claim_historical_reconstruction_job(integer) from public;
grant execute on function public.claim_historical_reconstruction_job(integer) to service_role;

create or replace function public.read_historical_reconstruction_chunk(
  p_user_id uuid,
  p_job_id text,
  p_limit integer default 20
) returns table (
  id text,
  portfolio_id text,
  kind text,
  transaction_type text,
  ticker text,
  quantity numeric,
  fill_price numeric,
  filled_at timestamptz,
  shares_before numeric,
  shares_after numeric,
  cash_before numeric,
  cash_after numeric
)
language sql
security definer
set search_path = ''
as $$
  select tx.id, tx.portfolio_id, tx.kind, tx.transaction_type, tx.ticker,
    tx.quantity, tx.fill_price, tx.filled_at, tx.shares_before,
    tx.shares_after, tx.cash_before, tx.cash_after
  from public.historical_reconstruction_jobs job
  join public.portfolio_transactions tx
    on tx.user_id = job.user_id and (
      (job.source_kind = 'import' and tx.import_batch_id = job.import_batch_id)
      or (job.source_kind = 'manual' and job.transaction_ids ? tx.id)
    )
  where job.user_id = p_user_id and job.id = p_job_id
    and tx.archived_at is null
    and (
      job.cursor_filled_at is null
      or tx.filled_at > job.cursor_filled_at
      or (tx.filled_at = job.cursor_filled_at and tx.id > job.cursor_transaction_id)
    )
  order by tx.filled_at, tx.id
  limit least(21, greatest(1, p_limit));
$$;
revoke all on function public.read_historical_reconstruction_chunk(uuid, text, integer)
  from public;
grant execute on function public.read_historical_reconstruction_chunk(uuid, text, integer)
  to service_role;

create or replace function public.complete_historical_reconstruction_chunk(
  p_user_id uuid,
  p_job_id text,
  p_results jsonb,
  p_working_portfolio jsonb,
  p_has_more boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.historical_reconstruction_jobs%rowtype;
  row jsonb;
  inserted_count integer := 0;
  scored_delta integer := 0;
  unscored_delta integer := 0;
  incomplete_delta integer := 0;
  skipped_delta integer := 0;
  next_cursor_filled_at timestamptz;
  next_cursor_transaction_id text;
begin
  select * into job from public.historical_reconstruction_jobs
  where user_id = p_user_id and id = p_job_id for update;
  if job.id is null or job.status <> 'running' or job.lease_expires_at < now() then
    raise exception 'historical_job_lease_lost';
  end if;
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_results, '[]'::jsonb)) > 40 then
    raise exception 'invalid_historical_chunk';
  end if;
  for row in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) rows(value)
  loop
    if row->>'status' not in ('scored', 'unscored', 'incomplete', 'skipped')
      or not exists (
        select 1 from public.portfolio_transactions tx
        where tx.user_id = p_user_id and tx.id = row->>'transactionId'
          and (
            (job.source_kind = 'import' and tx.import_batch_id = job.import_batch_id)
            or (job.source_kind = 'manual' and job.transaction_ids ? tx.id)
          )
      ) then raise exception 'invalid_historical_result'; end if;
    insert into public.historical_transaction_reconstructions (
      user_id, job_id, transaction_id, status, reason, cycle_key, cycle_as_of,
      strategy_ids, strategy_version_ids, zone_hints, alignment
    ) values (
      p_user_id, p_job_id, row->>'transactionId', row->>'status',
      nullif(row->>'reason', ''), nullif(row->>'cycleKey', ''),
      nullif(row->>'cycleAsOf', '')::timestamptz,
      coalesce(row->'strategyIds', '[]'::jsonb),
      coalesce(row->'strategyVersionIds', '[]'::jsonb),
      coalesce(row->'zoneHints', '[]'::jsonb),
      coalesce(row->'alignment', '[]'::jsonb)
    ) on conflict (user_id, job_id, transaction_id) do nothing;
    if found then
      inserted_count := inserted_count + 1;
      scored_delta := scored_delta + (row->>'status' = 'scored')::integer;
      unscored_delta := unscored_delta + (row->>'status' = 'unscored')::integer;
      incomplete_delta := incomplete_delta + (row->>'status' = 'incomplete')::integer;
      skipped_delta := skipped_delta + (row->>'status' = 'skipped')::integer;
      update public.portfolio_transactions tx set
        reconstruction_status = row->>'status',
        reconstruction_reason = nullif(row->>'reason', ''),
        reconstruction_cycle_key = nullif(row->>'cycleKey', ''),
        reconstruction_cycle_as_of = nullif(row->>'cycleAsOf', '')::timestamptz,
        reconstructed_at = now(),
        strategy_ids = coalesce(row->'strategyIds', '[]'::jsonb),
        zone_hints = coalesce(row->'zoneHints', '[]'::jsonb)
      where tx.user_id = p_user_id and tx.id = row->>'transactionId';
    end if;
  end loop;
  if not p_has_more and job.processed_count + inserted_count <> job.total_count then
    raise exception 'historical_chunk_count_mismatch';
  end if;
  select tx.filled_at, tx.id
  into next_cursor_filled_at, next_cursor_transaction_id
  from public.portfolio_transactions tx
  join jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) result
    on result->>'transactionId' = tx.id
  where tx.user_id = p_user_id and (
    (job.source_kind = 'import' and tx.import_batch_id = job.import_batch_id)
    or (job.source_kind = 'manual' and job.transaction_ids ? tx.id)
  )
  order by tx.filled_at desc, tx.id desc
  limit 1;
  update public.historical_reconstruction_jobs set
    working_portfolio = p_working_portfolio,
    processed_count = processed_count + inserted_count,
    scored_count = scored_count + scored_delta,
    unscored_count = unscored_count + unscored_delta,
    incomplete_count = incomplete_count + incomplete_delta,
    skipped_count = skipped_count + skipped_delta,
    failure_count = 0,
    cursor_filled_at = coalesce(next_cursor_filled_at, cursor_filled_at),
    cursor_transaction_id = coalesce(next_cursor_transaction_id, cursor_transaction_id),
    status = case when p_has_more then 'queued'
      when incomplete_count + incomplete_delta > 0 then 'incomplete'
      else 'complete' end,
    lease_expires_at = null,
    completed_at = case when p_has_more then null else now() end,
    updated_at = now()
  where user_id = p_user_id and id = p_job_id;
end;
$$;
revoke all on function public.complete_historical_reconstruction_chunk(uuid, text, jsonb, jsonb, boolean)
  from public;
grant execute on function public.complete_historical_reconstruction_chunk(uuid, text, jsonb, jsonb, boolean)
  to service_role;

create or replace function public.retry_historical_reconstruction_job(
  p_user_id uuid,
  p_job_id text,
  p_error_category text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.historical_reconstruction_jobs set
    failure_count = failure_count + 1,
    status = case when failure_count + 1 >= 5 then 'failed' else 'retrying' end,
    last_error_category = left(coalesce(p_error_category, 'unknown'), 80),
    next_retry_at = case when failure_count + 1 >= 5 then null else now() + interval '2 minutes' end,
    lease_expires_at = null,
    completed_at = case when failure_count + 1 >= 5 then now() else null end,
    updated_at = now()
  where user_id = p_user_id and id = p_job_id and status = 'running';
end;
$$;
revoke all on function public.retry_historical_reconstruction_job(uuid, text, text) from public;
grant execute on function public.retry_historical_reconstruction_job(uuid, text, text)
  to service_role;

-- Any archive invalidates active derived work. Restores intentionally require a
-- fresh import/reconstruction instead of reviving potentially stale evidence.
create or replace function public.supersede_archived_reconstruction_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null and new.import_batch_id is not null then
    update public.historical_reconstruction_jobs set
      status = 'superseded', lease_expires_at = null, next_retry_at = null,
      completed_at = now(), updated_at = now()
    where user_id = new.user_id and (
      import_batch_id = new.import_batch_id or transaction_ids ? new.id
    )
      and status in ('queued', 'running', 'retrying');
  end if;
  return new;
end;
$$;
drop trigger if exists supersede_reconstruction_on_archive on public.portfolio_transactions;
create trigger supersede_reconstruction_on_archive
after update of archived_at on public.portfolio_transactions
for each row execute function public.supersede_archived_reconstruction_jobs();
revoke all on function public.supersede_archived_reconstruction_jobs() from public;

-- Legacy portfolios lack a trustworthy creation timestamp. Establish a
-- forward-only boundary at migration time instead of guessing from account or
-- transaction age.
update public.user_state workspace
set portfolios = (
  select jsonb_agg(
    case when item ? 'createdAt' then item
      else jsonb_set(item, '{createdAt}', to_jsonb(now()::text), true)
    end
    order by ordinality
  )
  from jsonb_array_elements(coalesce(workspace.portfolios, '[]'::jsonb))
    with ordinality rows(item, ordinality)
)
where exists (
  select 1 from jsonb_array_elements(coalesce(workspace.portfolios, '[]'::jsonb)) item
  where not (item ? 'createdAt')
);

-- Establish truthful forward-only strategy boundaries for workspaces that
-- predate this migration. We never backdate these snapshots to account creation.
do $$
declare workspace public.user_state%rowtype;
begin
  for workspace in select * from public.user_state loop
    perform public.capture_workspace_history_for_user(
      workspace.user_id, workspace.strategies, workspace.portfolios, clock_timestamp()
    );
  end loop;
end
$$;

create or replace function public.recover_historical_reconstruction()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  endpoint text;
  secret text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets
  where name = 'conviction_cycle_function_url' limit 1;
  select decrypted_secret into secret from vault.decrypted_secrets
  where name = 'conviction_cycle_internal_secret' limit 1;
  if endpoint is null or secret is null then return; end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-scoring-secret', secret
    ),
    body := '{"recovery":true,"historicalOnly":true}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.recover_historical_reconstruction() from public;
grant execute on function public.recover_historical_reconstruction() to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'recover-historical-reconstruction'
  ) then
    perform cron.schedule(
      'recover-historical-reconstruction',
      '*/2 * * * *',
      'select public.recover_historical_reconstruction()'
    );
  end if;
exception
  when insufficient_privilege or undefined_table or invalid_schema_name then
    raise notice 'pg_cron historical reconstruction requires Supabase cron/vault support';
end
$$;
