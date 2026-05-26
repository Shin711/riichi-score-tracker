-- Follow-up hardening migration for MVP app behavior.

alter table public.events
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists events_session_id_created_at_id_idx
  on public.events (session_id, created_at desc, id desc);

-- Session players write access for session owners.
drop policy if exists "session_players_insert_owner" on public.session_players;
create policy "session_players_insert_owner"
  on public.session_players for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_players.session_id
        and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "session_players_update_owner" on public.session_players;
create policy "session_players_update_owner"
  on public.session_players for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_players.session_id
        and s.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_players.session_id
        and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "session_players_delete_owner" on public.session_players;
create policy "session_players_delete_owner"
  on public.session_players for delete
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_players.session_id
        and s.owner_user_id = auth.uid()
    )
  );

-- Event update/delete access for session owners.
drop policy if exists "events_insert_edit_key" on public.events;
drop policy if exists "events_insert_owner" on public.events;
create policy "events_insert_owner"
  on public.events for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = events.session_id
        and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "events_update_owner" on public.events;
create policy "events_update_owner"
  on public.events for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = events.session_id
        and s.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = events.session_id
        and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists "events_delete_owner" on public.events;
create policy "events_delete_owner"
  on public.events for delete
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = events.session_id
        and s.owner_user_id = auth.uid()
    )
  );
