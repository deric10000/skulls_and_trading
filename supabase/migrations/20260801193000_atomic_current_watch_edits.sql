-- Current Watch Update is one durable transaction: projection, compatibility
-- ledger, normalized ledger trigger, strategy assignments, history archives,
-- and the server-owned portfolio revision either all commit or all roll back.
create or replace function public.commit_current_watch_edit(
  p_portfolio_id text,
  p_expected_revision integer,
  p_portfolio jsonb,
  p_strategies jsonb,
  p_transactions jsonb default '[]'::jsonb,
  p_history_removal_tickers jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace public.user_state%rowtype;
  prior_portfolio jsonb;
  current_revision integer;
  next_revision integer;
  tx jsonb;
  v_ticker text;
  running_cash numeric(18, 2);
  running_holdings jsonb;
  running_average_costs jsonb;
  current_shares numeric(24, 6);
  current_average_cost numeric;
  expected_shares numeric(24, 6);
  expected_average_cost numeric;
  expected_cash numeric(18, 2);
  trade_value numeric(18, 2);
  touched_tickers text[] := array[]::text[];
  history_archives jsonb := '[]'::jsonb;
  tx_ids jsonb;
  legacy_fills jsonb;
  archived public.portfolio_ticker_history_archives%rowtype;
  next_share_fills jsonb;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if p_portfolio_id is null
    or p_portfolio->>'id' is distinct from p_portfolio_id
    or jsonb_typeof(coalesce(p_transactions, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_transactions, '[]'::jsonb)) > 100
    or jsonb_typeof(coalesce(p_history_removal_tickers, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_history_removal_tickers, '[]'::jsonb)) > 40
    or jsonb_typeof(p_strategies) <> 'array' then
    raise exception 'invalid_current_watch_edit';
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

  select * into workspace
  from public.user_state where user_id = caller for update;
  select item into prior_portfolio
  from jsonb_array_elements(workspace.portfolios) item
  where item->>'id' = p_portfolio_id;
  if prior_portfolio is null then raise exception 'portfolio_not_found'; end if;
  if coalesce((prior_portfolio->>'revision')::integer, 0) <> p_expected_revision then
    raise exception 'portfolio_revision_conflict';
  end if;
  if p_portfolio->>'type' is distinct from prior_portfolio->>'type'
    or p_portfolio->>'label' is distinct from prior_portfolio->>'label'
    or p_portfolio->>'createdAt' is distinct from prior_portfolio->>'createdAt'
    or coalesce((p_portfolio->>'cashAvailable')::numeric, -1) < 0
    or jsonb_typeof(coalesce(p_portfolio->'holdings', '[]'::jsonb)) <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
      where holding->>'ticker' !~ '^[A-Z][A-Z0-9.-]{0,9}$'
        or coalesce((holding->>'shares')::numeric, -1) < 0
        or coalesce((holding->>'avgPrice')::numeric, -1) < 0
    ) or (
      select count(*)
      from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb))
    ) <> (
      select count(distinct holding->>'ticker')
      from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
    ) then raise exception 'invalid_portfolio'; end if;

  -- Current Watch may change only assignment/exclusion fields on existing
  -- strategies. Strategy bodies and strategy identities remain server-owned.
  if jsonb_array_length(p_strategies) <> jsonb_array_length(workspace.strategies)
    or exists (
      select 1
      from jsonb_array_elements(workspace.strategies) prior
      left join lateral (
        select item from jsonb_array_elements(p_strategies) item
        where item->>'id' = prior->>'id' limit 1
      ) candidate on true
      where candidate.item is null
        or (prior - 'tickerExclusions' - 'appliedPortfolioIds')
          <> (candidate.item - 'tickerExclusions' - 'appliedPortfolioIds')
        or (coalesce(prior->'tickerExclusions', '{}'::jsonb) - p_portfolio_id)
          <> (coalesce(candidate.item->'tickerExclusions', '{}'::jsonb) - p_portfolio_id)
        or (
          select coalesce(array_agg(value #>> '{}' order by value #>> '{}'), array[]::text[])
          from jsonb_array_elements(coalesce(prior->'appliedPortfolioIds', '[]'::jsonb)) rows(value)
          where value #>> '{}' <> p_portfolio_id
        ) is distinct from (
          select coalesce(array_agg(value #>> '{}' order by value #>> '{}'), array[]::text[])
          from jsonb_array_elements(coalesce(candidate.item->'appliedPortfolioIds', '[]'::jsonb)) rows(value)
          where value #>> '{}' <> p_portfolio_id
        )
    ) then raise exception 'invalid_strategy_assignment_edit'; end if;

  running_cash := round(coalesce((prior_portfolio->>'cashAvailable')::numeric, 0), 2);
  select coalesce(jsonb_object_agg(holding->>'ticker', holding->'shares'), '{}'::jsonb)
  into running_holdings
  from jsonb_array_elements(coalesce(prior_portfolio->'holdings', '[]'::jsonb)) holding;
  select coalesce(jsonb_object_agg(holding->>'ticker', holding->'avgPrice'), '{}'::jsonb)
  into running_average_costs
  from jsonb_array_elements(coalesce(prior_portfolio->'holdings', '[]'::jsonb)) holding;

  for tx in
    select value
    from jsonb_array_elements(coalesce(p_transactions, '[]'::jsonb))
      with ordinality rows(value, ordinality)
    order by (value->>'filledAt')::timestamptz, ordinality
  loop
    if tx->>'portfolioId' is distinct from p_portfolio_id
      or tx->>'kind' not in ('qty', 'cash')
      or tx->>'id' !~ '^(fill|cash)-[0-9]+-[0-9]+$'
      or tx->>'filledAt' is null
      or nullif(trim(tx->>'timeZone'), '') is null
      or not exists (
        select 1 from pg_catalog.pg_timezone_names
        where name = tx->>'timeZone'
      ) then raise exception 'invalid_manual_transaction'; end if;
    if tx->>'kind' = 'qty' then
      v_ticker := tx->>'ticker';
      if v_ticker !~ '^[A-Z][A-Z0-9.-]{0,9}$'
        or tx->>'side' not in ('buy', 'sell')
        or coalesce((tx->>'deltaShares')::numeric, 0) <= 0
        or coalesce((tx->>'fillPrice')::numeric, 0) <= 0 then
        raise exception 'invalid_manual_qty_transaction';
      end if;
      current_shares := round(coalesce((running_holdings->>v_ticker)::numeric, 0), 6);
      current_average_cost := coalesce((running_average_costs->>v_ticker)::numeric, 0);
      if round((tx->>'sharesBefore')::numeric, 6) <> current_shares then
        raise exception 'share_sequence_conflict';
      end if;
      expected_shares := round(
        current_shares + case when tx->>'side' = 'buy'
          then (tx->>'deltaShares')::numeric else -(tx->>'deltaShares')::numeric end,
        6
      );
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
      if expected_shares < 0 or expected_cash < 0
        or round((tx->>'sharesAfter')::numeric, 6) <> expected_shares
        or round((tx->>'cashBefore')::numeric, 2) <> running_cash
        or round((tx->>'cashAfter')::numeric, 2) <> expected_cash then
        raise exception 'invalid_manual_qty_math';
      end if;
      running_cash := expected_cash;
      running_holdings := jsonb_set(running_holdings, array[v_ticker], to_jsonb(expected_shares), true);
      running_average_costs := jsonb_set(running_average_costs, array[v_ticker], to_jsonb(expected_average_cost), true);
      if not v_ticker = any(touched_tickers) then
        touched_tickers := array_append(touched_tickers, v_ticker);
      end if;
    else
      expected_cash := round(running_cash + (tx->>'deltaCash')::numeric, 2);
      if abs(coalesce((tx->>'deltaCash')::numeric, 0)) <= 0
        or expected_cash < 0
        or round((tx->>'cashBefore')::numeric, 2) <> running_cash
        or round((tx->>'cashAfter')::numeric, 2) <> expected_cash then
        raise exception 'invalid_manual_cash_math';
      end if;
      running_cash := expected_cash;
    end if;
  end loop;

  if round(coalesce((p_portfolio->>'cashAvailable')::numeric, 0), 2) <> running_cash
    or exists (
      select 1 from unnest(touched_tickers) touched(ticker)
      where round(coalesce((running_holdings->>touched.ticker)::numeric, 0), 6)
        <> coalesce((
          select round((holding->>'shares')::numeric, 6)
          from jsonb_array_elements(p_portfolio->'holdings') holding
          where holding->>'ticker' = touched.ticker
        ), 0)
        or abs(coalesce((running_average_costs->>touched.ticker)::numeric, 0) - coalesce((
          select (holding->>'avgPrice')::numeric
          from jsonb_array_elements(p_portfolio->'holdings') holding
          where holding->>'ticker' = touched.ticker
        ), 0)) > 0.000001
    ) or exists (
      -- A manual transaction must account for every quantity/cost change.
      -- Zero-share additions and removals are tracking-only structural edits.
      select 1
      from jsonb_array_elements(coalesce(prior_portfolio->'holdings', '[]'::jsonb)) prior
      join lateral (
        select holding
        from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
        where holding->>'ticker' = prior->>'ticker'
        limit 1
      ) candidate on true
      where not (prior->>'ticker' = any(touched_tickers))
        and (
          round((candidate.holding->>'shares')::numeric, 6)
            <> round((prior->>'shares')::numeric, 6)
          or abs((candidate.holding->>'avgPrice')::numeric - (prior->>'avgPrice')::numeric)
            > 0.000001
        )
    ) or exists (
      select 1
      from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) candidate
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(prior_portfolio->'holdings', '[]'::jsonb)) prior
        where prior->>'ticker' = candidate->>'ticker'
      )
        and not (candidate->>'ticker' = any(touched_tickers))
        and (
          round((candidate->>'shares')::numeric, 6) <> 0
          or abs((candidate->>'avgPrice')::numeric) > 0.000001
        )
    ) then raise exception 'portfolio_projection_mismatch'; end if;

  if (
    select count(distinct active.ticker)
    from (
      select holding->>'ticker' ticker
      from jsonb_array_elements(workspace.portfolios) source
      cross join lateral jsonb_array_elements(coalesce(source->'holdings', '[]'::jsonb)) holding
      where source->>'id' <> p_portfolio_id
      union all
      select holding->>'ticker' from jsonb_array_elements(p_portfolio->'holdings') holding
    ) active
  ) > 40 then raise exception 'ticker_limit_exceeded'; end if;

  next_share_fills := coalesce(workspace.share_fills, '[]'::jsonb);
  for v_ticker in
    select distinct upper(trim(value #>> '{}'))
    from jsonb_array_elements(coalesce(p_history_removal_tickers, '[]'::jsonb)) rows(value)
  loop
    if v_ticker !~ '^[A-Z][A-Z0-9.-]{0,9}$' then raise exception 'invalid_ticker'; end if;
    select coalesce(jsonb_agg(id), '[]'::jsonb) into tx_ids
    from public.portfolio_transactions
    where user_id = caller and portfolio_id = p_portfolio_id
      and portfolio_transactions.ticker = v_ticker and archived_at is null;
    select coalesce(jsonb_agg(item), '[]'::jsonb) into legacy_fills
    from jsonb_array_elements(next_share_fills) item
    where item->>'portfolioId' = p_portfolio_id
      and upper(item->>'ticker') = v_ticker;
    insert into public.portfolio_ticker_history_archives (
      user_id, portfolio_id, ticker, transaction_ids, legacy_share_fills
    ) values (caller, p_portfolio_id, v_ticker, tx_ids, legacy_fills)
    returning * into archived;
    update public.portfolio_transactions set archived_at = archived.archived_at
    where user_id = caller and portfolio_id = p_portfolio_id
      and portfolio_transactions.ticker = v_ticker and archived_at is null;
    next_share_fills := coalesce((
      select jsonb_agg(item order by ordinality)
      from jsonb_array_elements(next_share_fills) with ordinality rows(item, ordinality)
      where not (
        item->>'portfolioId' = p_portfolio_id
        and upper(item->>'ticker') = v_ticker
      )
    ), '[]'::jsonb);
    history_archives := history_archives || jsonb_build_array(jsonb_build_object(
      'ticker', v_ticker,
      'archiveId', archived.id,
      'purgeAt', archived.purge_at
    ));
  end loop;

  next_revision := current_revision + 1;
  p_portfolio := jsonb_set(p_portfolio, '{revision}', to_jsonb(next_revision), true);
  update public.portfolio_revisions
  set revision = next_revision, updated_at = now()
  where user_id = caller and portfolio_id = p_portfolio_id;
  update public.user_state
  set portfolios = (
      select jsonb_agg(
        case when item->>'id' = p_portfolio_id then p_portfolio else item end
        order by ordinality
      )
      from jsonb_array_elements(workspace.portfolios) with ordinality rows(item, ordinality)
    ),
    strategies = p_strategies,
    share_fills = coalesce(p_transactions, '[]'::jsonb) || next_share_fills,
    updated_at = now()
  where user_id = caller;

  return jsonb_build_object(
    'revision', next_revision,
    'historyArchives', history_archives
  );
end;
$$;

revoke all on function public.commit_current_watch_edit(
  text, integer, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.commit_current_watch_edit(
  text, integer, jsonb, jsonb, jsonb, jsonb
) to authenticated;
