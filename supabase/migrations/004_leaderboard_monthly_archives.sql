-- Permanent monthly leaderboard snapshots (archived at month rollover).

create table if not exists public.leaderboard_monthly_archives (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year >= 2000 and year <= 2100),
  month int not null check (month >= 1 and month <= 12),
  entries_json jsonb not null default '[]'::jsonb,
  games_count int not null default 0,
  archived_at timestamptz not null default now(),
  unique (year, month)
);

create index if not exists leaderboard_monthly_archives_year_month_idx
  on public.leaderboard_monthly_archives (year desc, month desc);

alter table public.leaderboard_monthly_archives enable row level security;

create policy "leaderboard_archives_select_all"
  on public.leaderboard_monthly_archives for select
  to anon, authenticated
  using (true);
