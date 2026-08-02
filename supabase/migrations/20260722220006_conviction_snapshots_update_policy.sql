-- Upserts need UPDATE RLS (portfolio_snapshots already has this).
create policy "snapshots_update_own"
  on public.conviction_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on table public.conviction_snapshots to authenticated;;
