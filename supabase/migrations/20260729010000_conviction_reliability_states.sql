-- Conviction scoring reliability: run states, scoring revision, narrower hashes,
-- snapshot eligibility guards, and notification evaluation payload support.
-- Additive / backward compatible. Does not rewrite historical snapshots.

-- 1) Widen strategy_check_runs status + observability columns
alter table public.strategy_check_runs
  drop constraint if exists strategy_check_runs_status_check;

alter table public.strategy_check_runs
  add constraint strategy_check_runs_status_check
  check (status in (
    'pending',
    'running',
    'complete',
    'failed',
    'superseded',
    'waiting_for_data',
    'incomplete',
    'overdue'
  ));

alter table public.strategy_check_runs
  add column if not exists error_category text,
  add column if not exists affected_tickers text[] not null default '{}'::text[],
  add column if not exists next_retry_at timestamptz,
  add column if not exists scoring_revision text;

create index if not exists strategy_check_runs_recovery_idx
  on public.strategy_check_runs (status, claimed_at)
  where status in (
    'pending', 'running', 'failed', 'waiting_for_data', 'incomplete', 'overdue'
  );

-- 2) Scoring revision on user_state (hash of scoring-relevant fields only)
alter table public.user_state
  add column if not exists scoring_revision text;

-- Backfill from current scoring-relevant payload when null
update public.user_state
set scoring_revision = encode(
  extensions.digest(
    concat(
      coalesce(portfolios, '[]'::jsonb)::text, ':',
      coalesce(strategies, '[]'::jsonb)::text, ':',
      coalesce(share_fills, '[]'::jsonb)::text
    ),
    'sha256'
  ),
  'hex'
)
where scoring_revision is null;

-- 3) Helper: scoring revision digest
create or replace function public.compute_scoring_revision(
  p_portfolios jsonb,
  p_strategies jsonb,
  p_share_fills jsonb
) returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      concat(
        coalesce(p_portfolios, '[]'::jsonb)::text, ':',
        coalesce(p_strategies, '[]'::jsonb)::text, ':',
        coalesce(p_share_fills, '[]'::jsonb)::text
      ),
      'sha256'
    ),
    'hex'
  );
$$;

-- 4) Narrow definition_hash to applied portfolio/holding/fill slice (v2: prefix)
create or replace function public.strategy_definition_hash_v2(
  p_strategy jsonb,
  p_cadence text,
  p_portfolios jsonb,
  p_share_fills jsonb
) returns text
language plpgsql
immutable
as $$
declare
  applied jsonb;
  scoped_portfolios jsonb := '[]'::jsonb;
  scoped_fills jsonb := '[]'::jsonb;
  portfolio jsonb;
  holding jsonb;
  fill jsonb;
  strategy_id text := coalesce(p_strategy->>'id', '');
  tickers text[] := '{}';
begin
  applied := coalesce(p_strategy->'appliedPortfolioIds', '[]'::jsonb);
  for portfolio in
    select value from jsonb_array_elements(coalesce(p_portfolios, '[]'::jsonb))
  loop
    if applied ? (portfolio->>'id')
       or applied @> to_jsonb(array[portfolio->>'id'])
       or exists (
         select 1
         from jsonb_array_elements_text(applied) applied_id
         where applied_id = portfolio->>'id'
       )
    then
      scoped_portfolios := scoped_portfolios || jsonb_build_array(
        jsonb_build_object(
          'id', portfolio->>'id',
          'holdings', coalesce(portfolio->'holdings', '[]'::jsonb)
        )
      );
      for holding in
        select value
        from jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb))
      loop
        if upper(trim(holding->>'ticker')) <> '' then
          tickers := array_append(tickers, upper(trim(holding->>'ticker')));
        end if;
      end loop;
    end if;
  end loop;

  for fill in
    select value from jsonb_array_elements(coalesce(p_share_fills, '[]'::jsonb))
  loop
    if upper(trim(fill->>'ticker')) = any (tickers)
       and (
         coalesce(fill->>'portfolioId', '') = ''
         or exists (
           select 1
           from jsonb_array_elements(scoped_portfolios) sp
           where sp->>'id' = fill->>'portfolioId'
         )
       )
    then
      scoped_fills := scoped_fills || jsonb_build_array(fill);
    end if;
  end loop;

  return 'v2:' || encode(
    extensions.digest(
      concat(
        strategy_id, ':', coalesce(p_cadence, ''), ':',
        coalesce(p_strategy, '{}'::jsonb)::text, ':',
        scoped_portfolios::text, ':',
        scoped_fills::text
      ),
      'sha256'
    ),
    'hex'
  );
end;
$$;

create or replace function public.refresh_scoring_projections(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace public.user_state%rowtype;
  global_symbol_count integer;
begin
  select * into workspace
  from public.user_state
  where user_id = p_user_id
  for update;
  if not found then
    return;
  end if;

  -- Keep scoring_revision aligned with scoring-relevant fields only.
  update public.user_state
  set scoring_revision = public.compute_scoring_revision(
    coalesce(workspace.portfolios, '[]'::jsonb),
    coalesce(workspace.strategies, '[]'::jsonb),
    coalesce(workspace.share_fills, '[]'::jsonb)
  )
  where user_id = p_user_id;

  select count(distinct ticker) into global_symbol_count
  from (
    select upper(trim(holding->>'ticker')) ticker
    from public.user_state us,
         jsonb_array_elements(coalesce(us.portfolios, '[]'::jsonb)) portfolio,
         jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) holding
    where us.user_id <> p_user_id
      and upper(trim(holding->>'ticker')) ~ '^[A-Z^][A-Z0-9.^-]{0,14}$'
    union
    select upper(trim(holding->>'ticker')) ticker
    from jsonb_array_elements(coalesce(workspace.portfolios, '[]'::jsonb)) portfolio,
         jsonb_array_elements(coalesce(portfolio->'holdings', '[]'::jsonb)) holding
    where upper(trim(holding->>'ticker')) ~ '^[A-Z^][A-Z0-9.^-]{0,14}$'
  ) authoritative_symbols;
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

-- 5) Claim: capture scoring_revision; reclaim waiting/incomplete; prefer scoring revision match
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

-- 6) Fail helper with categories
create or replace function public.fail_strategy_check_run(
  p_run_id uuid,
  p_error text,
  p_error_category text default null,
  p_affected_tickers text[] default '{}'::text[],
  p_status text default 'failed',
  p_next_retry_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.strategy_check_runs
  set status = case
        when p_status in (
          'failed', 'superseded', 'waiting_for_data', 'incomplete', 'overdue'
        ) then p_status
        else 'failed'
      end,
      error = left(coalesce(p_error, 'unknown error'), 2000),
      error_category = p_error_category,
      affected_tickers = coalesce(p_affected_tickers, '{}'::text[]),
      next_retry_at = p_next_retry_at,
      completed_at = now()
  where id = p_run_id
    and status in (
      'pending', 'running', 'waiting_for_data', 'incomplete', 'overdue'
    );
end;
$$;

revoke all on function public.fail_strategy_check_run(uuid, text, text, text[], text, timestamptz)
  from public;
grant execute on function public.fail_strategy_check_run(uuid, text, text, text[], text, timestamptz)
  to service_role;

-- Keep old 2-arg signature working
create or replace function public.fail_strategy_check_run(
  p_run_id uuid,
  p_error text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fail_strategy_check_run(
    p_run_id, p_error, null, '{}'::text[], 'failed', null
  );
end;
$$;

-- 7) complete_strategy_check_run: scoring_revision + empty-result guard
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
