# Daily Discord scoring quiz

Every morning the bot posts a winning hand to the club Discord and asks how much it is worth. Members answer **han**, **fu**, and the **score** privately, and the answer plus a recap goes up that evening.

- **Posts:** 10am ET (14:00 UTC)
- **Reveals:** 10pm ET (02:00 UTC)
- **Channel:** `1534603299376992286`

Hands are generated fresh each day and are always 1–5 han, so han and fu both still matter — no yakuman, no "it's just a mangan".

> Vercel runs scheduled jobs to the hour, not the minute, so the post can land any time in the 10am hour. The schedule is fixed in UTC, so during winter (EST) both times shift an hour earlier — the morning post arrives around 9am.

---

## What you need to do

Setting this up means creating a Discord application. **You have to do this part yourself** — it involves a bot token and a signing key, and those should never be pasted into a chat or a pull request.

### Step 1: Create the application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, name it something like `Flushing Riichi Quiz`, and accept the terms.
3. On the **General Information** page, find **Public Key** and copy it. You will need it in Step 4.

### Step 2: Create the bot and copy its token

1. In the left sidebar, click **Bot**.
2. Click **Reset Token**, confirm, and copy the token that appears. **This is a password — treat it like one.** Discord only shows it once.
3. Scroll down and turn **off** "Public Bot" unless you want other servers adding it.

### Step 3: Invite the bot to the club server

1. In the left sidebar, click **OAuth2** → **URL Generator**.
2. Under **Scopes**, tick **`bot`**.
3. Under **Bot Permissions**, tick **Send Messages** and **Embed Links**. Nothing else is needed.
4. Copy the generated URL at the bottom, open it, and add the bot to the club server.
5. Make sure the bot can actually see and post in the quiz channel. If the channel is private, add the bot's role to it.

### Step 4: Add the environment variables in Vercel

Open [vercel.com](https://vercel.com) → your **flushing-riichi-mahjong-club** project → **Settings** → **Environment Variables**, and add these three for **Production**:

| Key | Value |
| --- | --- |
| `DISCORD_BOT_TOKEN` | The token from Step 2 |
| `DISCORD_PUBLIC_KEY` | The public key from Step 1 |
| `DISCORD_QUIZ_CHANNEL_ID` | `1534603299376992286` |

You also need `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`, which the leaderboard cron already uses — see [`vercel-monthly-cron-setup.md`](vercel-monthly-cron-setup.md).

> To get a different channel's id: in Discord, enable **Settings → Advanced → Developer Mode**, then right-click the channel and choose **Copy Channel ID**.

### Step 5: Run the database migration

Run `supabase/migrations/010_discord_quiz.sql` against the Supabase project, the same way as the earlier migrations (Supabase dashboard → **SQL Editor** → paste → **Run**).

### Step 6: Deploy, then point Discord at the endpoint

The endpoint has to exist before Discord will accept it, so deploy first.

1. Redeploy to production so the new env vars and routes are live.
2. Back in the Developer Portal, on **General Information**, find **Interactions Endpoint URL**.
3. Enter:

   ```text
   https://flushing-riichi-mahjong-club.vercel.app/api/discord/interactions
   ```

4. Click **Save Changes**.

Discord immediately sends a test request with a deliberately bad signature and expects it to be rejected. If it saves without complaint, verification is working. If it refuses, `DISCORD_PUBLIC_KEY` is wrong or the deploy has not finished.

---

## Trying it before the morning

You can post a hand on demand with the cron secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://flushing-riichi-mahjong-club.vercel.app/api/cron/quiz-post
```

Reveal it the same way:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://flushing-riichi-mahjong-club.vercel.app/api/cron/quiz-reveal
```

Only one quiz exists per day. Calling the post endpoint again the same day returns `"skipped"` rather than posting a second hand.

To see what a hand looks like without posting anything:

```bash
npx tsx scripts/preview-discord-quiz.ts 5
```

Add `--date 2026-09-14` to see exactly the hand that day will post — the generator is seeded from the date.

---

## How answering works

1. Someone clicks **Answer** on the daily post.
2. A private form asks for han, fu, and the score.
3. The bot replies, only to them, with a tick or cross against each of the three — but **not** the correct values, so the evening reveal still has something to reveal.

**One attempt per person per day.** A second submission is refused rather than replacing the first. If the form can't be read (a typo like `three` instead of `3`), nothing is recorded and they can press **Answer** again — a typo shouldn't burn someone's attempt.

### What counts as a correct score

Score is accepted in any of the usual notations:

| Situation | Accepted |
| --- | --- |
| Ron | `3900`, `3,900` |
| Non-dealer tsumo | `1300/2600`, `2600/1300`, `500-1000`, or the total `5200` |
| Dealer tsumo | `2000 all`, `2000`, or the total `6000` |

Once a hand is worth mangan on han alone (5+ han), **fu is not graded** — it cannot change the payment, so marking someone wrong for it would be a gotcha. The receipt says so explicitly.

---

## If something goes wrong

**The morning post didn't appear.** Check the Vercel deployment logs for `/api/cron/quiz-post`. The usual causes are a missing `DISCORD_BOT_TOKEN`, or the bot lacking permission to post in the channel.

**Clicking Answer does nothing / "interaction failed".** The Interactions Endpoint URL is wrong, or the deploy that added it has been rolled back. Discord needs a reply within three seconds.

**A hand looks wrong.** Every hand is checked against the scoring engine before it is posted, and the answer is stored at post time so the reveal cannot drift from what was graded. If a hand still looks off, grab the date and open an issue — `npx tsx scripts/preview-discord-quiz.ts --date <that date>` reproduces it exactly.

**Answering stayed open past the reveal.** The reveal job closes answering first and posts second, so a failed post still closes the hand. Re-running `/api/cron/quiz-reveal` picks up any hand that is still open, including one from a previous day.
