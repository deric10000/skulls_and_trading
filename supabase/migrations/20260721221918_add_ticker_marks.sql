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

grant select, insert, update on table public.ticker_marks to authenticated;;
