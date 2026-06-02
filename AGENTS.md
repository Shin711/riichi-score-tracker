<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single-package Next.js 16 app (`npm` at repo root). See [README.md](README.md) for Supabase migrations and env vars.

### Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` → http://localhost:3000 |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Production serve | `npm start` (after build) |
| Scoring/session logic checks | `npx tsx scripts/verify-calculator-scoring.ts` and `npx tsx scripts/verify-session-rules.ts` |

### Services

- **Next.js** is the only process to run locally. There is no Docker or local Supabase in-repo.
- **Supabase** (hosted) is required for sessions, players, leaderboard, imports, and auth. Copy `.env.local.example` → `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server API writes expect the service role key).
- **`/calculator`** is client-only and works without Supabase — useful to smoke-test the dev server when DB env is missing.

### Gotchas

- Apply all SQL files under `supabase/migrations/` (`001`–`006`) in order in the Supabase SQL editor before testing DB-backed routes.
- Vercel cron jobs (`vercel.json`) do not run locally; hit `/api/cron/archive-leaderboard` and `/api/cron/maintenance` manually with `Authorization: Bearer $CRON_SECRET` if needed.
- Anonymous session creation is rate-limited (10/hour, 30/day per network).
