# Monthly leaderboard cron (Vercel)

The app archives finished leaderboard months automatically. You need two things on Vercel: the **`CRON_SECRET`** env var and a **production deploy** that includes `vercel.json`.

Months use **US Eastern** (`America/New_York`). A game counts toward April if **End game** was tapped between midnight Eastern on April 1 and midnight Eastern on May 1.

---

## Part 1 — Add `CRON_SECRET`

This stops random people from calling your archive URL. Vercel sends this secret automatically when it runs the scheduled job.

### Step 1: Generate a random secret

On your computer, run **one** of these and copy the output:

**PowerShell (Windows):**

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

**Or** use any password manager / [1Password generator](https://1password.com/password-generator/) — at least 32 characters.

Example (do **not** use this exact value):

```text
k7Xm2pQ9vL4nR8wT1yU6sA0bC3dE5fG7
```

### Step 2: Add it in Vercel

1. Open [vercel.com](https://vercel.com) → your **flushing-riichi-mahjong-club** project.
2. Go to **Settings** → **Environment Variables**.
3. Click **Add New**:
   - **Key:** `CRON_SECRET`
   - **Value:** paste the secret you generated
   - **Environments:** check **Production** (required for cron). Preview is optional.
4. Click **Save**.

You do **not** need to wire this up in code — Vercel sends it as:

```http
Authorization: Bearer <your CRON_SECRET value>
```

when calling `/api/cron/archive-leaderboard`.

### Step 3 (local dev, optional)

Add the same value to `.env.local` if you want to test the cron route manually:

```env
CRON_SECRET=k7Xm2pQ9vL4nR8wT1yU6sA0bC3dE5fG7
```

Test locally:

```powershell
curl -H "Authorization: Bearer YOUR_SECRET" http://localhost:3000/api/cron/archive-leaderboard
```

You should get `{"ok":true,"archived":0}` (or a number if months were backfilled).

---

## Part 2 — Redeploy so cron is active

`vercel.json` in the repo tells Vercel to run a job **every day at 10:00 UTC** (~5–6 AM Eastern). That job archives any **completed** months that are not saved yet. Opening `/leaderboard` also triggers the same archive logic (backup).

Cron only runs on **Production** deployments, and only after Vercel has seen `vercel.json` in a successful production build.

### Option A — Push to GitHub (recommended)

If the project is connected to GitHub:

1. Commit and push your branch (including `vercel.json` and the cron API route).
2. Merge to your production branch (usually `main` / `master`).
3. Vercel starts a **Production** deployment automatically.
4. Wait until it shows **Ready** on the Vercel **Deployments** tab.

### Option B — Redeploy from the dashboard

If code is already on GitHub but cron was added recently:

1. Vercel → **Deployments**.
2. Open the latest **Production** deployment.
3. Click **⋯** → **Redeploy**.
4. Leave **Use existing Build Cache** unchecked if you changed `vercel.json` or env vars.
5. Confirm **Redeploy**.

**Important:** Adding `CRON_SECRET` alone does not redeploy. You must redeploy **after** saving the env var so the running app knows the secret.

### Verify cron is registered

1. Vercel → your project → **Settings** → **Cron Jobs** (or **Crons** in the sidebar).
2. You should see:
   - **Path:** `/api/cron/archive-leaderboard` — schedule `0 10 * * *` (daily 10:00 UTC)
   - **Path:** `/api/cron/maintenance` — schedule `0 11 * * *` (daily 11:00 UTC)

The **maintenance** job deletes empty sessions older than 7 days (no recorded hands) and checks Postgres size. When the database reaches **400 MB**, it logs an error and optionally POSTs to `STORAGE_ALERT_WEBHOOK_URL` (e.g. a Discord webhook), at most once per 24 hours.

If nothing appears, production has not yet deployed a commit that includes `vercel.json`.

---

## What happens each month (Eastern time)

| When | What |
|------|------|
| During the month | `/leaderboard` shows only games **ended** this month (Eastern). |
| After midnight Eastern on the 1st | Previous month is a “closed” month. |
| Daily cron (~5–6 AM Eastern) | App saves previous month to `leaderboard_monthly_archives` if missing. |
| Daily maintenance cron | Deletes empty sessions >7 days; storage alert at 400 MB. |
| Any time someone opens leaderboard | Same archive check runs (backup if cron missed a day). |
| **Past months** on leaderboard page | Download CSV / JSON of saved standings. |

---

## Checklist

- [ ] Ran Supabase migrations through `006_maintenance.sql`
- [ ] `CRON_SECRET` set in Vercel **Production** environment variables
- [ ] Optional: `STORAGE_ALERT_WEBHOOK_URL` for Discord/Slack when DB ≥ 400 MB
- [ ] Production deployment **Ready** after `vercel.json` was added
- [ ] **Settings → Cron Jobs** shows `/api/cron/archive-leaderboard` and `/api/cron/maintenance`
- [ ] `/leaderboard` loads and shows current month label (e.g. “April 2026”)
