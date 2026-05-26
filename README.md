# Riichi Score Tracker

Web app to track Riichi Mahjong sessions: player profiles, shareable session links, round-by-round events, and live totals.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Supabase** (Postgres + Auth) — free tier
- **Vercel** — free hosting (recommended)

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. In the Supabase SQL editor, run these migrations in order:
   - [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)
   - [`supabase/migrations/002_rls_minimal_and_constraints.sql`](supabase/migrations/002_rls_minimal_and_constraints.sql)
3. Copy [`.env.local.example`](.env.local.example) to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (recommended for API writes)
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
3. Add the same environment variables in Vercel project settings.
4. Deploy.

## Usage

- **Players**: add names on `/players`.
- **New session**: click **Create session** on the home page. The edit key is stored in this browser’s `localStorage`.
- **Share**: send `/s/<shareId>` for view-only access. Use the in-page editor link (`?editKey=...`) or paste an edit key into the session page to enable edits on another device.
- **Claim**: sign in at `/login`, open a session you created, click **Claim session** to attach it to your account (`/my/sessions`).
- **Safety**: use **Undo last event** in session history to quickly revert the latest mistaken entry.

## Event types (MVP)

- `riichi` — player places a riichi stick (default 1000)
- `win` — ron/tsumo helper computes seat deltas (+ honba)
- `manual_adjustment` — arbitrary per-seat deltas (chombo, corrections)
