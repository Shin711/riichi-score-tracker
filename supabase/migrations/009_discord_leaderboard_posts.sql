-- Remembers the last standings message posted to a Discord webhook so the next
-- post can delete it, leaving exactly one live leaderboard in the channel.

create table if not exists public.discord_leaderboard_posts (
  webhook_id text primary key,
  channel_id text,
  message_id text not null,
  posted_at timestamptz not null default now()
);

-- Service-role only: message ids are plumbing, not public leaderboard data.
-- RLS on with no policies denies anon/authenticated and leaves service role
-- (SUPABASE_SERVICE_ROLE_KEY) as the sole writer.
alter table public.discord_leaderboard_posts enable row level security;
