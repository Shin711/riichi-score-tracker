-- Edits and removals of recorded games wait for approval in a private Discord
-- channel, so one person cannot quietly rewrite or wipe the club's results.

create table if not exists public.game_change_requests (
  id uuid primary key default gen_random_uuid(),
  -- Set null once the game is removed; before_json keeps the record of it.
  game_id uuid references public.imported_games (id) on delete set null,
  kind text not null check (kind in ('edit', 'delete')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'stale')),
  -- The game as it was when the change was requested. Approval is refused if
  -- the game has changed since, so an old request can't overwrite a newer fix.
  before_json jsonb not null,
  -- For edits: the request body as submitted (validated, players not created
  -- yet — that happens on approval, so rejected requests leave no new players).
  proposed_json jsonb,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  requested_ip text,
  discord_channel_id text,
  discord_message_id text,
  decided_by_discord_id text,
  decided_by_discord_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request per game at a time.
create unique index if not exists game_change_requests_one_pending_idx
  on public.game_change_requests (game_id)
  where status = 'pending';

create index if not exists game_change_requests_created_at_idx
  on public.game_change_requests (created_at desc);

-- Service-role only: rows hold IPs and Discord ids.
alter table public.game_change_requests enable row level security;

-- All writes to imported_games go through the API (service role). The public
-- insert/delete policies from 005 let anyone with the anon key bypass approval
-- entirely, so remove them. Reads stay public.
drop policy if exists "imported_games_insert_all" on public.imported_games;
drop policy if exists "imported_games_delete_all" on public.imported_games;
