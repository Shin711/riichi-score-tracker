# Approving game edits and removals in Discord

Editing or removing a recorded game on the website no longer happens straight away. The bot posts the request to a private Discord channel showing what would change, with **Approve** and **Reject** buttons. Nothing changes until someone in that channel clicks **Approve**.

- **Who can approve:** anyone who can see the approval channel. Discord only lets people who can see a channel click its buttons, and the site also ignores clicks from any other channel. To give someone approval rights, give them access to the channel.
- **Club admins skip approval:** a signed-in account listed in `ADMIN_EMAILS` or `ADMIN_USER_IDS` still edits and removes straight away.
- **One open request per game:** while a change is waiting, the game shows "Edit awaiting approval" or "Removal awaiting approval" on the import page, and a second request for it is refused.
- **Out-of-date requests aren't applied:** if a game changes or is removed after a request is made, approving that request does nothing and the post says why.
- **New players are created on approval:** names in a pending edit that don't match a player yet are only added to Players once the edit is approved, so rejected requests leave nothing behind.
- **Rate limit:** 10 requests per IP per hour.
- Recording new games is unchanged: no approval needed.

---

## Setup

This reuses the quiz bot. If the quiz is set up, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY` and the interactions endpoint are already in place (see [`discord-scoring-quiz-setup.md`](discord-scoring-quiz-setup.md)).

### Step 1: Make the approval channel

1. In the club server, create a **private** text channel, for example `#game-approvals`.
2. Add the people who should approve changes (or a role such as Moderators).
3. Add the bot (or its role) to the channel with **View Channel**, **Send Messages** and **Embed Links**.
4. With Developer Mode on (**Settings → Advanced**), right-click the channel and choose **Copy Channel ID**.

### Step 2: Run the database migration — before deploying

Run `supabase/migrations/012_game_change_requests.sql` in the Supabase dashboard (**SQL Editor** → paste → **Run**).

It creates the `game_change_requests` table. It also removes the old public **insert** and **delete** policies on `imported_games`; those let anyone with the site's public key add or delete games directly through Supabase, skipping the site (and now, approval). The site does all writes with the service role, so nothing on the site depends on them.

> Until this migration runs, edit and removal requests fail with an error.

### Step 3: Add the environment variable in Vercel

In **Settings → Environment Variables**, add for **Production**:

| Key | Value |
| --- | --- |
| `DISCORD_APPROVAL_CHANNEL_ID` | The channel id from Step 1 |

Then redeploy. Without it, edits and removals from non-admins are refused with "the Discord approval channel isn't set up yet".

### Step 4: Try it

Edit a game on the import page while signed out. A request should appear in the approval channel within a few seconds. Approve it and the post's buttons are replaced with "✅ Edit approved by @you and applied."; the leaderboard and a corrected game log are posted as usual.
