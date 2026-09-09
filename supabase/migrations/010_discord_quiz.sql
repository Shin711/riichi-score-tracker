-- Daily Discord scoring quiz: one generated hand per day, plus the answers
-- people submit through the quiz modal.

create table if not exists public.discord_quizzes (
  id uuid primary key default gen_random_uuid(),
  -- One hand per club day (US Eastern), so re-running the post cron is a no-op
  -- rather than a second hand in the channel.
  quiz_date date not null unique,
  channel_id text not null,
  message_id text,
  -- The hand as generated. Kept so the reveal renders the same hand the
  -- question showed, without re-generating and risking a mismatch.
  hand_json jsonb not null,
  -- The solved answer, stored at post time. The reveal reads this rather than
  -- re-solving, so the published answer can never drift from the graded one.
  answer_json jsonb not null,
  posted_at timestamptz not null default now(),
  revealed_at timestamptz
);

create index if not exists discord_quizzes_quiz_date_idx
  on public.discord_quizzes (quiz_date desc);

create table if not exists public.discord_quiz_answers (
  quiz_id uuid not null references public.discord_quizzes (id) on delete cascade,
  discord_user_id text not null,
  discord_username text,
  han int not null,
  fu int not null,
  -- Stored as typed, so the recap can show what people actually wrote.
  score_text text not null,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  -- One attempt per person per quiz; the insert conflicting is how a second
  -- attempt gets refused.
  primary key (quiz_id, discord_user_id)
);

create index if not exists discord_quiz_answers_quiz_idx
  on public.discord_quiz_answers (quiz_id);

-- Service-role only, like the leaderboard post table: these rows hold the
-- unrevealed answer and Discord user ids, neither of which is public data.
-- RLS on with no policies denies anon/authenticated and leaves the service role
-- (SUPABASE_SERVICE_ROLE_KEY) as the sole reader and writer.
alter table public.discord_quizzes enable row level security;
alter table public.discord_quiz_answers enable row level security;
