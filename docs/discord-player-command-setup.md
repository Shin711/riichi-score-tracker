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

`/player` uses its **own** Discord application so replies show up under a club/stats bot name instead of `Flushing Riichi Quiz`.

### Step 1: Create a separate Discord application

1. In the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application** and name it something like `Flushing Riichi Club` (or `Flushing Riichi Stats`).
2. On **General Information**, copy **Public Key** → this becomes `DISCORD_PLAYER_PUBLIC_KEY`.
3. Open **Bot** → **Reset Token** → copy the token → this becomes `DISCORD_PLAYER_BOT_TOKEN`. Turn **off** "Public Bot".
4. Open **OAuth2** → **URL Generator**, tick **`bot`** and **`applications.commands`**, tick **Send Messages** and **Embed Links**, and open the generated URL to add it to the club server.

### Step 2: Add the environment variables in Vercel

In Vercel → **Settings** → **Environment Variables** (Production):

| Key | Value |
| --- | --- |
| `DISCORD_PLAYER_BOT_TOKEN` | Token from Step 1 |
| `DISCORD_PLAYER_PUBLIC_KEY` | Public Key from Step 1 |
| `DISCORD_GUILD_ID` | Optional (`1508641664124850266`); if unset, resolved from `DISCORD_QUIZ_CHANNEL_ID` |

### Step 3: Deploy, set Interactions Endpoint URL, then register `/player`

1. Redeploy production so the new keys are live.
2. On the new application's **General Information** page in Discord Developer Portal, set **Interactions Endpoint URL** to:

   ```text
   https://flushing-riichi-mahjong-club.vercel.app/api/discord/interactions
   ```

   Click **Save Changes**.
3. Register `/player` on the new bot (this also removes any old `/player` command from `Flushing Riichi Quiz`):

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" -X POST \
     https://flushing-riichi-mahjong-club.vercel.app/api/discord/commands
   ```

   A successful response looks like `{"ok":true,"guildId":"…","applicationId":"…","commands":[{"id":"…","name":"player"}],"removedFromQuizBot":true}`.

### Step 4: Backfill older Mahjong Soul logs

Games imported before migration `013_imported_game_hand_results.sql` have no `hand_results_json` yet, so they count for placement only until backfilled. Because `MAJSOUL_UID` and `MAJSOUL_TOKEN` live on Vercel, you can backfill in small batches directly on the server:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" -X POST \
  "https://flushing-riichi-mahjong-club.vercel.app/api/imports/games/mjs/backfill?limit=8"
```

Repeat until `"remaining": 0` (pass `afterId` from `"lastId"` if `"skipped"` or `"failed"` is non-zero). Manual in-person games have no hand log and stay placement-only.

---

## Trying it

In the club server:

```text
/player name:Alice
```

The name field suggests roster names as you type. An unknown name gets a private reply.
