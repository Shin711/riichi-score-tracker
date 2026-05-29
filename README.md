# Flushing Riichi Mahjong Club

Web app for **Flushing Riichi Mahjong Club**: player profiles, shareable session links, round-by-round scoring, monthly leaderboard, and Mahjong Soul imports.

**Production URL:** `https://flushing-riichi-mahjong-club.vercel.app` (set the Vercel project name to `flushing-riichi-mahjong-club`).

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + Auth) — free tier
- **Vercel** — free hosting (recommended)

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. In the Supabase SQL editor, run these migrations in order:
   - [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)
   - [`supabase/migrations/002_rls_minimal_and_constraints.sql`](supabase/migrations/002_rls_minimal_and_constraints.sql)
   - [`supabase/migrations/003_session_ended_at.sql`](supabase/migrations/003_session_ended_at.sql)
   - [`supabase/migrations/004_leaderboard_monthly_archives.sql`](supabase/migrations/004_leaderboard_monthly_archives.sql)
   - [`supabase/migrations/005_imported_games.sql`](supabase/migrations/005_imported_games.sql)
3. Copy [`.env.local.example`](.env.local.example) to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (recommended for API writes)
   - `CRON_SECRET` (optional; secures the monthly archive cron on Vercel)
4. Enable **Email** auth in Supabase (Authentication → Providers) for magic-link sign-in.
5. **Google sign-in (recommended):** follow [`docs/google-sign-in-setup.md`](docs/google-sign-in-setup.md) — no email SMTP needed.
6. **Email magic links (optional):** configure **[Resend](https://resend.com)** SMTP — see [`docs/auth-email-setup.md`](docs/auth-email-setup.md).
7. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy (Vercel + GitHub)

1. Push this repo to GitHub.
2. Import the repo in [Vercel](https://vercel.com).
3. Set the Vercel **project name** to `flushing-riichi-mahjong-club` (Settings → General → Project Name) so the default URL matches the club.
4. Add the same environment variables in Vercel project settings.
5. Deploy. For the **monthly leaderboard archive**, also follow [`docs/vercel-monthly-cron-setup.md`](docs/vercel-monthly-cron-setup.md) (`CRON_SECRET` + production redeploy).

After renaming an existing deployment, update **Google OAuth** authorized origins and any Supabase **Site URL** / redirect URLs to the new hostname.

## Usage

- **Players**: add names on `/players`.
- **Leaderboard**: `/leaderboard` ranks players for the **current calendar month (US Eastern)**. When a month ends, standings are archived and downloadable under **Past months**. Setup: [`docs/vercel-monthly-cron-setup.md`](docs/vercel-monthly-cron-setup.md).
- **Import game**: `/import` — add a finished friendly / Mahjong Soul match (final scores + optional paipu link). Mark AI/bot seats on mixed human–bot games; bot scores are saved but only humans count on the leaderboard.
- **End game**: on a session you edit, tap **End game** when play is over — locks score entry and counts the game on the leaderboard. Use **Reopen** if you ended by mistake.
- **New session**: click **Create session** on the home page. The edit key is stored in this browser’s `localStorage`.
- **Share**: send `/s/<shareId>` for view-only access. Use the in-page editor link (`?editKey=...`) or paste an edit key into the session page to enable edits on another device.
- **Claim**: sign in at `/login`, open a session you created, click **Claim session** to attach it to your account (`/my/sessions`).
- **Safety**: use **Undo last event** in session history to quickly revert the latest mistaken entry.

## Event types (MVP)

- `riichi` — player places a riichi stick (default 1000)
- `win` — ron/tsumo helper computes seat deltas (+ honba)
- `manual_adjustment` — arbitrary per-seat deltas (chombo, corrections)
