-- Allow import sells to close brokerage lots that were never accounted in
-- this portfolio timeline when the client marks untrackedClose=true.
-- Fix PL/pgSQL ambiguity introduced when the cash-treatment commit wrapped
-- the insert select: alias `tx` collided with declare variable `tx`, so every
-- preserve/apply import failed with an unexpected database error.
-- Forward-only; prior migration already applied.
-- Broker-shaped imports remain additive and backward-compatible. Old clients
-- default to applying trade cash flow; append imports may explicitly preserve
-- current cash while still recording exact executed quantity history.
--
-- Import failures raise stable exception names plus a tightly controlled JSON
-- DETAIL object (safe codes, row numbers, cash/share amounts). Clients must
-- never surface raw SQL or unconstrained database prose.
create or replace function public.raise_portfolio_import_error(
  p_code text,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception '%', p_code
    using
      errcode = 'P0001',
      detail = coalesce(p_detail, '{}'::jsonb)::text,
      hint = 'portfolio_import_error';
end;
$$;
revoke all on function public.raise_portfolio_import_error(text, jsonb) from public;

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
  cash_treatment text := coalesce(nullif(p_batch->>'cashTreatment', ''), 'apply');
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
  source_row integer;
begin
  if caller is null then
    perform public.raise_portfolio_import_error('not_authenticated');
  end if;
  if p_portfolio_id is null or p_portfolio->>'id' is distinct from p_portfolio_id then
    perform public.raise_portfolio_import_error('portfolio_mismatch');
  end if;
  if tx_count < 1 or tx_count > 5000 then
    perform public.raise_portfolio_import_error('invalid_transaction_count');
  end if;
  if batch_id is null
    or batch_id !~ '^import-[A-Za-z0-9-]{8,80}$'
    or batch_mode not in ('append', 'replace')
    or cash_treatment not in ('apply', 'preserve')
    or (cash_treatment = 'preserve' and batch_mode <> 'append') then
    perform public.raise_portfolio_import_error('invalid_batch');
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
    perform public.raise_portfolio_import_error('batch_identity_conflict');
  end if;

  insert into public.portfolio_revisions (user_id, portfolio_id, revision)
  values (caller, p_portfolio_id, coalesce(p_expected_revision, 0))
  on conflict (user_id, portfolio_id) do nothing;

  select revision into current_revision
  from public.portfolio_revisions
  where user_id = caller and portfolio_id = p_portfolio_id
  for update;
  if current_revision is distinct from p_expected_revision then
    perform public.raise_portfolio_import_error('portfolio_revision_conflict');
  end if;

  select portfolios into workspace_portfolios
  from public.user_state where user_id = caller for update;
  if workspace_portfolios is null or not exists (
    select 1 from jsonb_array_elements(workspace_portfolios) item
    where item->>'id' = p_portfolio_id
  ) then
    perform public.raise_portfolio_import_error('portfolio_not_found');
  end if;

  select item into prior_portfolio
  from jsonb_array_elements(workspace_portfolios) item
  where item->>'id' = p_portfolio_id;
  if coalesce((prior_portfolio->>'revision')::integer, 0) <> p_expected_revision then
    perform public.raise_portfolio_import_error('portfolio_revision_conflict');
  end if;
  if prior_portfolio->>'type' <> 'portfolio'
    or p_portfolio->>'type' <> 'portfolio'
    or p_portfolio->>'label' is distinct from prior_portfolio->>'label'
    or p_portfolio->>'createdAt' is distinct from prior_portfolio->>'createdAt' then
    perform public.raise_portfolio_import_error('portfolio_identity_conflict');
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
      perform public.raise_portfolio_import_error('invalid_replace_basis');
    end if;
    opening_cash := case when p_batch->>'replaceBasis' = 'opening'
      then round(coalesce((p_batch->>'openingCash')::numeric, 0), 2)
      else null end;
    running_cash := coalesce(opening_cash, 0);
    if running_cash < 0 then
      perform public.raise_portfolio_import_error('invalid_opening_cash');
    end if;
    if p_batch->>'replaceBasis' = 'opening' then
      opening_at := nullif(p_batch->>'openingAt', '')::timestamptz;
      opening_time_zone := nullif(trim(p_batch->>'openingTimeZone'), '');
      if opening_at is null
        or opening_time_zone is null
        or not exists (
          select 1 from pg_catalog.pg_timezone_names
          where name = opening_time_zone
        ) then
        perform public.raise_portfolio_import_error('invalid_opening_boundary');
      end if;
    end if;
    running_holdings := '{}'::jsonb;
    running_average_costs := '{}'::jsonb;
  end if;

  -- Historical symbols may exceed the live market-data budget. The final
  -- active holdings check below remains the authoritative 40-ticker gate.

  for tx in
    select value
    from jsonb_array_elements(p_transactions) with ordinality rows(value, ordinality)
    order by (value->>'filledAt')::timestamptz, ordinality
  loop
    source_row := nullif(substring(tx->>'id' from ':row:([0-9]{1,6})$'), '')::integer;
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
      perform public.raise_portfolio_import_error(
        'invalid_transaction',
        jsonb_build_object('code', 'invalid_transaction', 'sourceRow', source_row)
      );
    end if;
    if opening_at is not null and (tx->>'filledAt')::timestamptz < opening_at then
      perform public.raise_portfolio_import_error(
        'transaction_precedes_opening_boundary',
        jsonb_build_object(
          'code', 'transaction_precedes_opening_boundary',
          'sourceRow', source_row,
          'filledAt', tx->>'filledAt'
        )
      );
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
      then
        perform public.raise_portfolio_import_error(
          'invalid_qty_transaction',
          jsonb_build_object(
            'code', 'invalid_qty_transaction',
            'sourceRow', source_row,
            'ticker', tx->>'ticker',
            'transactionType', tx->>'side'
          )
        );
      end if;
      current_shares := round(coalesce((running_holdings->>(tx->>'ticker'))::numeric, 0), 6);
      current_average_cost := coalesce(
        (running_average_costs->>(tx->>'ticker'))::numeric,
        0
      );
      -- Import-only: brokerage sells may close lots never accounted in this
      -- portfolio yet. When untrackedClose is true, trust the client sequence
      -- if share math is internally consistent and does not go negative.
      if coalesce((tx->>'untrackedClose')::boolean, false)
        and tx->>'side' = 'sell'
        and round((tx->>'sharesBefore')::numeric, 6) > current_shares then
        if round((tx->>'sharesAfter')::numeric, 6) < 0
          or round((tx->>'sharesBefore')::numeric, 6)
            <> round(
              (tx->>'sharesAfter')::numeric + (tx->>'deltaShares')::numeric,
              6
            )
        then
          perform public.raise_portfolio_import_error(
            'invalid_share_math',
            jsonb_build_object(
              'code', 'invalid_share_math',
              'sourceRow', source_row,
              'ticker', tx->>'ticker',
              'transactionType', tx->>'side'
            )
          );
        end if;
        current_shares := round((tx->>'sharesBefore')::numeric, 6);
        current_average_cost := coalesce(
          nullif((tx->>'fillPrice')::numeric, 0),
          current_average_cost
        );
      elsif round((tx->>'sharesBefore')::numeric, 6) <> current_shares then
        perform public.raise_portfolio_import_error(
          'share_sequence_conflict',
          jsonb_build_object(
            'code', 'share_sequence_conflict',
            'sourceRow', source_row,
            'ticker', tx->>'ticker',
            'transactionType', tx->>'side',
            'filledAt', tx->>'filledAt',
            'availableShares', current_shares,
            'requiredShares', (tx->>'sharesBefore')::numeric
          )
        );
      end if;
      expected_shares := round(
        current_shares + case when tx->>'side' = 'buy'
          then (tx->>'deltaShares')::numeric else -(tx->>'deltaShares')::numeric end,
        6
      );
      if expected_shares < 0 then
        perform public.raise_portfolio_import_error(
          'oversell',
          jsonb_build_object(
            'code', 'oversell',
            'sourceRow', source_row,
            'ticker', tx->>'ticker',
            'transactionType', 'sell',
            'filledAt', tx->>'filledAt',
            'availableShares', current_shares,
            'requiredShares', (tx->>'deltaShares')::numeric
          )
        );
      end if;
      if round((tx->>'sharesAfter')::numeric, 6) <> expected_shares then
        perform public.raise_portfolio_import_error(
          'invalid_share_math',
          jsonb_build_object(
            'code', 'invalid_share_math',
            'sourceRow', source_row,
            'ticker', tx->>'ticker',
            'transactionType', tx->>'side'
          )
        );
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
      expected_cash := case when cash_treatment = 'preserve'
        then running_cash
        else round(
          running_cash + case when tx->>'side' = 'sell' then trade_value else -trade_value end,
          2
        )
      end;
      if cash_treatment = 'apply' and expected_cash < 0 then
        perform public.raise_portfolio_import_error(
          'insufficient_cash',
          jsonb_build_object(
            'code', 'insufficient_cash',
            'sourceRow', source_row,
            'ticker', tx->>'ticker',
            'transactionType', tx->>'side',
            'filledAt', tx->>'filledAt',
            'requiredCash', trade_value,
            'availableCash', running_cash
          )
        );
      end if;
      if round((tx->>'cashBefore')::numeric, 2) <> running_cash
        or round((tx->>'cashAfter')::numeric, 2) <> expected_cash
      then
        perform public.raise_portfolio_import_error(
          'invalid_trade_cash_math',
          jsonb_build_object(
            'code', case
              when cash_treatment = 'apply' and expected_cash < 0 then 'insufficient_cash'
              when round((tx->>'cashBefore')::numeric, 2) <> running_cash
                then 'stale_cash_sequence'
              else 'invalid_trade_cash_math'
            end,
            'sourceRow', source_row,
            'ticker', tx->>'ticker',
            'transactionType', tx->>'side',
            'filledAt', tx->>'filledAt',
            'requiredCash', trade_value,
            'availableCash', running_cash
          )
        );
      end if;
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
        perform public.raise_portfolio_import_error(
          'invalid_cash_transaction',
          jsonb_build_object('code', 'invalid_cash_transaction', 'sourceRow', source_row)
        );
      end if;
      expected_cash := round(running_cash + (tx->>'deltaCash')::numeric, 2);
      if expected_cash < 0 then
        perform public.raise_portfolio_import_error(
          'insufficient_cash',
          jsonb_build_object(
            'code', 'insufficient_cash',
            'sourceRow', source_row,
            'transactionType', case
              when (tx->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end,
            'filledAt', tx->>'filledAt',
            'requiredCash', abs((tx->>'deltaCash')::numeric),
            'availableCash', running_cash
          )
        );
      end if;
      if round((tx->>'cashBefore')::numeric, 2) <> running_cash
        or round((tx->>'cashAfter')::numeric, 2) <> expected_cash
      then
        perform public.raise_portfolio_import_error(
          'invalid_cash_math',
          jsonb_build_object(
            'code', 'stale_cash_sequence',
            'sourceRow', source_row,
            'filledAt', tx->>'filledAt',
            'availableCash', running_cash
          )
        );
      end if;
      running_cash := expected_cash;
    end if;
  end loop;

  if round(coalesce((p_portfolio->>'cashAvailable')::numeric, 0), 2) <> running_cash then
    perform public.raise_portfolio_import_error('portfolio_cash_mismatch');
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
  ) then
    perform public.raise_portfolio_import_error('invalid_portfolio_holdings');
  end if;
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
  ) then
    perform public.raise_portfolio_import_error('portfolio_holdings_mismatch');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_portfolio->'holdings', '[]'::jsonb)) holding
    where abs(
      coalesce((holding->>'avgPrice')::numeric, 0) -
      coalesce((running_average_costs->>(holding->>'ticker'))::numeric, 0)
    ) > 0.000001
  ) then
    perform public.raise_portfolio_import_error('portfolio_average_cost_mismatch');
  end if;

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
  ) > 40 then
    perform public.raise_portfolio_import_error(
      'ticker_limit_exceeded',
      jsonb_build_object('code', 'ticker_limit_exceeded', 'limit', 40)
    );
  end if;

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
    'rowsSkipped', least(5000, greatest(0,
      coalesce((p_batch->'report'->>'rowsSkipped')::integer, 0))),
    'cashTreatment', cash_treatment,
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

  begin
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
      tx_row->>'id', caller, p_portfolio_id, tx_row->>'kind',
      case when tx_row->>'kind' = 'qty' then tx_row->>'side'
        when (tx_row->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end,
      nullif(tx_row->>'ticker', ''), nullif(tx_row->>'deltaShares', '')::numeric,
      nullif(tx_row->>'fillPrice', '')::numeric,
      case when tx_row->>'kind' = 'cash' then abs((tx_row->>'deltaCash')::numeric) end,
      (tx_row->>'filledAt')::timestamptz, tx_row->>'timeZone', 'import', batch_id,
      concat_ws(
        '|',
        p_portfolio_id,
        case when tx_row->>'kind' = 'qty' then tx_row->>'side'
          when (tx_row->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end,
        coalesce(tx_row->>'ticker', ''),
        trim(trailing '.' from trim(trailing '0' from
          round(coalesce(nullif(tx_row->>'deltaShares', '')::numeric, 0), 6)::text)),
        to_char(
          round(coalesce(nullif(tx_row->>'fillPrice', '')::numeric, 0), 2),
          'FM99999999999999999990.00'
        ),
        to_char(
          round(case when tx_row->>'kind' = 'cash'
            then abs((tx_row->>'deltaCash')::numeric) else 0 end, 2),
          'FM99999999999999999990.00'
        ),
        to_char(
          (tx_row->>'filledAt')::timestamptz at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      ),
      nullif(tx_row->>'sharesBefore', '')::numeric,
      nullif(tx_row->>'sharesAfter', '')::numeric, nullif(tx_row->>'cashBefore', '')::numeric,
      nullif(tx_row->>'cashAfter', '')::numeric,
      case when tx_row->>'kind' = 'cash'
        then case when (tx_row->>'deltaCash')::numeric > 0 then 'deposit' else 'withdrawal' end
        when tx_row->>'side' = 'sell' and (tx_row->>'sharesAfter')::numeric = 0 then 'go_to_cash'
        when tx_row->>'side' = 'sell' then 'trim'
        else 'add' end,
      '[]'::jsonb, '[]'::jsonb
    from jsonb_array_elements(p_transactions) as tx_row;
  exception
    when unique_violation then
      perform public.raise_portfolio_import_error(
        'duplicate_transaction',
        jsonb_build_object('code', 'duplicate_transaction')
      );
    when others then
      if pg_catalog.position(
        lower(sqlerrm),
        'historical_reconstruction'
      ) > 0 then
        perform public.raise_portfolio_import_error(
          'historical_reconstruction_enqueue_failed'
        );
      end if;
      raise;
  end;

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


