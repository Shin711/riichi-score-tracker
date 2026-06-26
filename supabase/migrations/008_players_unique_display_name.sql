-- Enforce unique player names (case-insensitive, trimmed).
-- Merges any existing duplicates into the earliest-created profile per name.

create or replace function public._remap_player_id_in_jsonb_array(
  entries jsonb,
  old_id uuid,
  new_id uuid
)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(
      case
        when coalesce(elem->>'player_id', elem->>'playerId') = old_id::text then
          case
            when elem ? 'player_id' then jsonb_set(elem, '{player_id}', to_jsonb(new_id::text))
            when elem ? 'playerId' then jsonb_set(elem, '{playerId}', to_jsonb(new_id::text))
            else elem
          end
        else elem
      end
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(entries, '[]'::jsonb)) as elem
$$;

do $$
declare
  rec record;
  keeper_id uuid;
  dupe_id uuid;
begin
  update public.players
  set display_name = trim(display_name)
  where display_name <> trim(display_name);

  for rec in
    select lower(trim(display_name)) as name_key
    from public.players
    group by lower(trim(display_name))
    having count(*) > 1
  loop
    select id into keeper_id
    from public.players
    where lower(trim(display_name)) = rec.name_key
    order by created_at asc, id asc
    limit 1;

    for dupe_id in
      select id
      from public.players
      where lower(trim(display_name)) = rec.name_key
        and id <> keeper_id
    loop
      update public.session_players sp
      set player_id = keeper_id
      where sp.player_id = dupe_id
        and not exists (
          select 1
          from public.session_players sp2
          where sp2.session_id = sp.session_id
            and sp2.player_id = keeper_id
        );

      delete from public.session_players
      where player_id = dupe_id;

      update public.imported_games ig
      set entries_json = public._remap_player_id_in_jsonb_array(ig.entries_json, dupe_id, keeper_id)
      where exists (
        select 1
        from jsonb_array_elements(ig.entries_json) elem
        where coalesce(elem->>'player_id', elem->>'playerId') = dupe_id::text
      );

      update public.leaderboard_monthly_archives lma
      set entries_json = public._remap_player_id_in_jsonb_array(lma.entries_json, dupe_id, keeper_id)
      where exists (
        select 1
        from jsonb_array_elements(lma.entries_json) elem
        where coalesce(elem->>'player_id', elem->>'playerId') = dupe_id::text
      );

      delete from public.players
      where id = dupe_id;
    end loop;
  end loop;
end $$;

drop function if exists public._remap_player_id_in_jsonb_array(jsonb, uuid, uuid);

create unique index if not exists players_display_name_normalized_unique
  on public.players (lower(trim(display_name)));
