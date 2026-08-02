alter table public.user_state add column if not exists flags jsonb not null default '{}'::jsonb;;
