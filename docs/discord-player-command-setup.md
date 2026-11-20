# Discord `/player` command

Anyone in the club server can run `/player` and see one roster player's rivals:

- **Fed the most points to** — rons they dealt into, and the points on those hands
- **Won the most off** — rons they took from each opponent
- **Beat most often** — how often they placed above each opponent

It counts only the games on the current leaderboard month (US Eastern), the same games as the standings. Tsumo counts on the player's own line and is not charged to one opponent. AI seats are left off the opponent lists.

Deal-in totals come from Mahjong Soul logs and from sessions scored on the site. A game entered as final scores only still counts for "beat most often". The footer says how many of the games had a hand log.

The reply is visible in the channel.

---

## Setup

This reuses the quiz bot. `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, and the interactions endpoint need to be in place first ([`discord-scoring-quiz-setup.md`](discord-scoring-quiz-setup.md)).

### Step 1: Re-invite the bot with the commands scope

Slash commands need the **`applications.commands`** scope. The original quiz invite only had **`bot`**.

1. In the [Discord Developer Portal](https://discord.com/developers/applications), open the bot, then **OAuth2** → **URL Generator**.
2. Tick **`bot`** and **`applications.commands`**.
3. Under **Bot Permissions**, tick **Send Messages** and **Embed Links**.
4. Open the generated URL and add the bot to the club server again. Discord updates the existing install; it does not create a second bot.

### Step 2: Run the database migration — before deploying

Run `supabase/migrations/013_imported_game_hand_results.sql` in the Supabase dashboard (**SQL Editor** → paste → **Run**).

It adds `hand_results_json` to `imported_games`. New Mahjong Soul imports save each winning hand there. Until the column exists, those imports fail and `/player` cannot load.

### Step 3: Deploy, then register the command

Registration uses the bot token already stored on Vercel, so it is a POST to the site rather than a local script:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" -X POST \
  https://flushing-riichi-mahjong-club.vercel.app/api/discord/commands
```

A successful response looks like `{"ok":true,"guildId":"…","commands":[{"id":"…","name":"player"}]}`. The command shows up in the club server right away. It resolves the server from `DISCORD_QUIZ_CHANNEL_ID`, so that channel still has to be one the bot can see.

If Discord answers with a missing-access error, Step 1 was skipped.

### Step 4: Backfill older logs (optional)

Games imported before this column existed have no hand list, so they count for placement only. To fill them in, from a checkout that has the Mahjong Soul and Supabase secrets:

```bash
npx tsx --env-file=.env.local scripts/backfill-hand-results.ts
npx tsx --env-file=.env.local scripts/backfill-hand-results.ts --write
```

The first command prints what it would save. `--write` needs `SUPABASE_SERVICE_ROLE_KEY`. It pauses between logs and stops if Mahjong Soul refuses two fetches in a row. `--limit 5` tries only the first five. Manual games with no log link are left alone.

---

## Trying it

In the club server:

```text
/player name:Alice
```

The name field suggests roster names as you type. An unknown name gets a private reply.
