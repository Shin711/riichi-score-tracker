-- Flushing Riichi Mahjong Club schema (MVP)

create extension if not exists "pgcrypto";

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  share_id text not null unique,
  title text,
  rules_json jsonb not null default '{}'::jsonb,
  edit_key text not null,
  owner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.session_players (
  session_id uuid not null references public.sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  seat text not null check (seat in ('E', 'S', 'W', 'N')),
  primary key (session_id, seat),
  unique (session_id, player_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_session_id_created_at_idx
  on public.events (session_id, created_at);

create or replace function public.can_edit_session(p_session_id uuid, p_edit_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.edit_key = p_edit_key
  );
$$;

grant execute on function public.can_edit_session(uuid, text) to anon, authenticated;

alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.events enable row level security;

-- Players
create policy "players_select_all"
  on public.players for select
  to anon, authenticated
  using (true);

create policy "players_insert_all"
  on public.players for insert
  to anon, authenticated
  with check (owner_user_id is null or owner_user_id = auth.uid());

create policy "players_update_owner"
  on public.players for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Sessions
create policy "sessions_select_all"
  on public.sessions for select
  to anon, authenticated
  using (true);

create policy "sessions_insert_all"
  on public.sessions for insert
  to anon, authenticated
  with check (owner_user_id is null or owner_user_id = auth.uid());

create policy "sessions_update_owner"
  on public.sessions for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Session players
create policy "session_players_select_all"
  on public.session_players for select
  to anon, authenticated
  using (true);

-- Events
create policy "events_select_all"
  on public.events for select
  to anon, authenticated
  using (true);

create policy "events_insert_edit_key"
  on public.events for insert
  to anon, authenticated
  with check (
    public.can_edit_session(session_id, (payload_json ->> 'editKey'))
  );
