-- Link imports to accounts (submitter) and support "my games" lookups.

alter table public.imported_games
  add column if not exists imported_by_user_id uuid references auth.users (id) on delete set null;

create index if not exists imported_games_imported_by_user_id_idx
  on public.imported_games (imported_by_user_id, played_at desc)
  where imported_by_user_id is not null;

-- Games the user imported, or played in via a player profile they own.
create or replace function public.imports_for_user(p_user_id uuid)
returns setof public.imported_games
language sql
stable
as $$
  select ig.*
  from public.imported_games ig
  where ig.imported_by_user_id = p_user_id
     or exists (
       select 1
       from jsonb_array_elements(ig.entries_json) elem
       join public.players pl on pl.id = (elem->>'player_id')::uuid
       where pl.owner_user_id = p_user_id
         and elem->>'player_id' is not null
     )
  order by ig.played_at desc;
$$;
