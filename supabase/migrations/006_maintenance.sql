-- Rate limiting, empty-session cleanup, and DB size checks (service role only).

create table if not exists public.api_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);

create index if not exists api_rate_limits_window_start_idx
  on public.api_rate_limits (window_start);

alter table public.api_rate_limits enable row level security;

create table if not exists public.maintenance_state (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.maintenance_state enable row level security;

create or replace function public.check_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max_count int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits as r (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = r.count + 1
  returning r.count into v_count;

  delete from public.api_rate_limits where window_start < now() - interval '2 days';

  return v_count <= p_max_count;
end;
$$;

create or replace function public.delete_empty_stale_sessions(p_older_than_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  with doomed as (
    select s.id
    from public.sessions s
    where s.created_at < now() - (p_older_than_days || ' days')::interval
      and not exists (
        select 1 from public.events e where e.session_id = s.id
      )
  )
  delete from public.sessions s
  using doomed d
  where s.id = d.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.get_database_size_bytes()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
revoke all on function public.delete_empty_stale_sessions(int) from public;
revoke all on function public.get_database_size_bytes() from public;

grant execute on function public.check_rate_limit(text, int, int) to service_role;
grant execute on function public.delete_empty_stale_sessions(int) to service_role;
grant execute on function public.get_database_size_bytes() to service_role;
