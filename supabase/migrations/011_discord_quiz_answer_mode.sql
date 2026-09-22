-- Which form a quiz answer came through: the typed form, or the multiple-choice
-- beginner form. The beginner form is the easier of the two, so the evening
-- recap reports them separately rather than blending them.
--
-- Rows from before the beginner form existed were all typed, which the default
-- covers. Run this before deploying the build that adds the Beginner button:
-- until the column exists, every submission fails.

alter table public.discord_quiz_answers
  add column if not exists mode text not null default 'typed'
  check (mode in ('typed', 'beginner'));
