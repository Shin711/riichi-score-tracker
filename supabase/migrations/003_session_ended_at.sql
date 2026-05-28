-- Mark sessions as finished when the table is done playing.

alter table public.sessions
  add column if not exists ended_at timestamptz;

create index if not exists sessions_ended_at_idx
  on public.sessions (ended_at)
  where ended_at is not null;
