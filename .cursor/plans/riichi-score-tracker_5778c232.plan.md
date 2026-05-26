---
name: riichi-score-tracker
overview: Build a free-hosted web app to create Riichi Mahjong score sessions, track players and rounds, and compute totals automatically, with shareable links first and optional accounts later.
todos:
  - id: choose-hosting
    content: Confirm Vercel+Supabase (default) vs GitHub Pages+Supabase.
    status: completed
  - id: bootstrap-app
    content: Scaffold Next.js app with Tailwind + TypeScript and basic routes.
    status: in_progress
  - id: supabase-schema
    content: Create Supabase tables (players, sessions, session_players, events) + minimal RLS.
    status: pending
  - id: scoring-ledger
    content: Implement event ledger -> totals computation and round entry forms.
    status: pending
  - id: sharing
    content: Add shareId routing and MVP edit-on-this-device key flow.
    status: pending
  - id: accounts-phase2
    content: Add Supabase Auth and “My sessions” views (later phase).
    status: pending
isProject: false
---

### Goal
Create a website similar in spirit to “Riichi Nomi NYC” score tracking: **session-based Riichi scoring**, **player profiles**, and **round-by-round entry with automatic totals**, hosted free.

### Recommended stack (free-hosted)
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind
- **Hosting**: Vercel free tier (simplest) *or* GitHub Pages if you strongly prefer (see alternative below)
- **Database + Auth**: Supabase free tier (Postgres, Row Level Security, optional OAuth/email)
- **IDs/sharing**: Public, unguessable `shareId` per session (works without accounts); later add “my sessions” tied to user accounts.

### Alternative if you insist on GitHub-only hosting
- **Static SPA** (Vite/React) on GitHub Pages + Supabase for DB/Auth.
- Trade-off: no server rendering, but perfectly fine for this app.

### Core UX (MVP)
- **Home** (`app/page.tsx`): create new session, open session by link.
- **Players** (`app/players/page.tsx`): create/edit player profiles.
- **Session page** (`app/s/[shareId]/page.tsx`):
  - Add/select 4 players
  - Configure rules (starting points, return points, honba value, riichi stick value, uma/oka toggles)
  - Enter rounds/hands as events (riichi sticks placed, honba increment, payments)
  - Live scoreboard + history log

### Data model (Supabase)
- **`players`**: `id`, `display_name`, `created_at`, `owner_user_id` (nullable for now)
- **`sessions`**: `id`, `share_id`, `title`, `rules_json`, `created_at`, `owner_user_id` (nullable)
- **`session_players`**: `session_id`, `player_id`, `seat` (E/S/W/N)
- **`events`** (append-only ledger): `id`, `session_id`, `type`, `payload_json`, `created_at`

Why events: you can recompute totals deterministically, support edits via “undo/delete event”, and keep an audit trail.

### Riichi scoring logic (MVP scope)
Implement the parts needed for common club scorekeeping:
- **Rounds**: east/south tracking metadata (optional display)
- **Riichi sticks**: placed by player, collected by winner
- **Honba**: increment/decrement with hand result; apply honba payments
- **Win types**: `tsumo` / `ron` with point transfers (either enter deltas directly, or guided form that computes deltas)
- **Chombo / penalties**: manual adjustments event
- **Totals**: compute current points per player from starting points + sum of event deltas

Start with a pragmatic approach: **UI calculates deltas** from forms, but also allow a “manual adjustment” event so you’re never blocked.

### Security & sharing
- **Share link**: anyone with `shareId` can view; editing controlled by a second unguessable `editKey` stored in browser localStorage (MVP), then later replaced by accounts.
- **Supabase RLS**:
  - Allow `select` on `sessions/events` by `share_id`
  - Allow `insert/update/delete` only if (a) authenticated owner, or (b) valid `editKey` mechanism (implemented as a lightweight edge function *only if needed*). For MVP simplicity, we can start with **no-delete** and only append events from the client while keeping the edit key client-side; then harden.

### Implementation steps
1. **Bootstrap project**: `nextjs + tailwind + typescript` (suggested repo name `riichi-score-tracker`).
2. **Set up Supabase**: create project, tables, RLS policies, and generate TypeScript types.
3. **Build player profiles UI**: create/list/edit players.
4. **Build session flow**: create session → attach 4 players → session page with ledger and live totals.
5. **Add Riichi rule helpers**: riichi sticks, honba, tsumo/ron forms that compute deltas.
6. **Sharing**: route by `shareId`, read-only view by default, “enable editing on this device” via edit key (MVP).
7. **Accounts (phase 2)**: Supabase Auth; “My sessions”; migrate edit-key sessions to owned sessions.

### Key files/directories you’ll end up with
- `app/page.tsx`
- `app/players/page.tsx`
- `app/s/[shareId]/page.tsx`
- `lib/supabase/client.ts`
- `lib/scoring/ledger.ts` (event → deltas → totals)
- `supabase/migrations/*` (schema)

### Test plan
- Create 4 players → new session → enter a few hands (riichi + honba + ron/tsumo) → verify totals match expectations.
- Open `shareId` in an incognito window: view works; editing depends on MVP edit-key toggle.

### Assumptions
- You want a **web-first** app (mobile-friendly), not a native app.
- You’re OK using a free managed backend (Supabase) rather than running your own server.