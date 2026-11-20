# Discord `/player` command

Anyone in the club server can run `/player` and see one roster player's stats for the current leaderboard month (US Eastern):

- **Rank & rating** — exact leaderboard standing, net points, and per-game average
- **Placements & scores** — 1st/2nd/3rd/4th breakdown, average placement, Top 2 and 4th rates, and high/low game scores
- **Best matchups** — opponents they finish above most often (head-to-head win–loss record)
- **Toughest matchups** — opponents who finish above them most often

Everything comes from final game scores and placements, so in-person games and online Mahjong Soul games count equally with 100% coverage and no replay backfill required. AI seats are included in 1–4 table numbering and left off the matchup lists.

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

---

## Trying it

In the club server:

```text
/player name:Alice
```

The name field suggests roster names as you type. An unknown name gets a private reply.
