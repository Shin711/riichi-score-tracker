-- Friendly / Mahjong Soul games imported without a full session ledger.

create table if not exists public.imported_games (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null,
  starting_points int not null default 25000,
  entries_json jsonb not null default '[]'::jsonb,
  mjs_paipu_url text,
  mjs_record_uuid text,
  created_at timestamptz not null default now()
);

create unique index if not exists imported_games_mjs_record_uuid_idx
  on public.imported_games (mjs_record_uuid)
  where mjs_record_uuid is not null;

create index if not exists imported_games_played_at_idx
  on public.imported_games (played_at desc);

alter table public.imported_games enable row level security;

create policy "imported_games_select_all"
  on public.imported_games for select
  to anon, authenticated
  using (true);

create policy "imported_games_insert_all"
  on public.imported_games for insert
  to anon, authenticated
  with check (true);

create policy "imported_games_delete_all"
  on public.imported_games for delete
  to anon, authenticated
  using (true);
