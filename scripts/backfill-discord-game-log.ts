/**
 * Posts every imported game of the current season (October 2026 on) to the
 * Discord game log, oldest first — for seeding the channel after turning the
 * webhook on. Mahjong Soul games get replay stats when MAJSOUL_UID/TOKEN are set.
 *
 * Prints what it would post by default; add --post to actually send. It keeps
 * no record of what was sent, so running it with --post twice posts twice.
 * --no-stats skips the Mahjong Soul lookups entirely.
 *
 *   npx tsx --env-file=.env scripts/backfill-discord-game-log.ts [--post] [--no-stats]
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { buildGameLogWebhookPayload } from "../src/lib/discord/gameLogMessage";
import { getGameLogWebhook, postWebhookMessage } from "../src/lib/discord/webhook";
import type { ImportedGameRow } from "../src/lib/imports/types";
import {
  LEADERBOARD_SEASON_START_MONTH,
  LEADERBOARD_SEASON_START_YEAR,
} from "../src/lib/leaderboard/qualification";
import { getMonthPeriodBounds } from "../src/lib/leaderboard/timezone";
import {
  isMajsoulLookupConfigured,
  withMajsoulSession,
  type MajsoulGameFetch,
} from "../src/lib/majsoul/client";
import { summarizeMajsoulRecord } from "../src/lib/majsoul/record";
import {
  alignMajsoulStatsToScores,
  computeMajsoulGameStats,
  type MajsoulGameStats,
} from "../src/lib/majsoul/stats";

/** Discord allows 5 webhook posts per 2s; stay well under it. */
const POST_INTERVAL_MS = 1_000;
/** Mahjong Soul throttles an account that pulls replays back-to-back. */
const FETCH_INTERVAL_MS = 3_000;
/** Don't keep hammering an account that is being refused. */
const MAX_FETCH_FAILURES_IN_A_ROW = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statsForRow(row: ImportedGameRow, game: MajsoulGameFetch): MajsoulGameStats | null {
  const stats = game.detail ? computeMajsoulGameStats(game.detail) : null;
  if (!stats) return null;
  return alignMajsoulStatsToScores(
    stats,
    summarizeMajsoulRecord(game.record).seats.map((seat) => seat.finalScore),
    row.entries_json.map((entry) => entry.final_score)
  );
}

async function loadStats(rows: ImportedGameRow[]): Promise<Map<string, MajsoulGameStats>> {
  const statsById = new Map<string, MajsoulGameStats>();
  const mjsRows = rows.filter((row) => row.mjs_record_uuid);
  if (mjsRows.length === 0) return statsById;
  if (!isMajsoulLookupConfigured()) {
    console.warn("MAJSOUL_UID/MAJSOUL_TOKEN not set — posting Mahjong Soul games without stats.");
    return statsById;
  }

  await withMajsoulSession(async (fetchGame) => {
    let failuresInARow = 0;
    for (const row of mjsRows) {
      try {
        const stats = statsForRow(row, await fetchGame(row.mjs_record_uuid!));
        failuresInARow = 0;
        if (stats) statsById.set(row.id, stats);
        else console.warn(`No usable stats for ${row.mjs_record_uuid}.`);
      } catch (e) {
        console.warn(`Could not fetch ${row.mjs_record_uuid}:`, e instanceof Error ? e.message : e);
        failuresInARow += 1;
        if (failuresInARow >= MAX_FETCH_FAILURES_IN_A_ROW) {
          console.warn("Mahjong Soul keeps refusing — giving up on stats for the remaining games.");
          return;
        }
      }
      await sleep(FETCH_INTERVAL_MS);
    }
  });
  return statsById;
}

async function main() {
  const post = process.argv.includes("--post");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (see .env.local.example).");
  // supabase-js wants a WebSocket for realtime even though we never use it;
  // Node < 22 has none built in.
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });

  const webhook = getGameLogWebhook();
  if (post && !webhook) throw new Error("DISCORD_LOG_WEBHOOK_URL is not set or not a webhook URL.");

  const { startIso } = getMonthPeriodBounds(
    LEADERBOARD_SEASON_START_YEAR,
    LEADERBOARD_SEASON_START_MONTH
  );
  const { data, error } = await supabase
    .from("imported_games")
    .select("id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at")
    .gte("played_at", startIso)
    .order("played_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ImportedGameRow[];
  console.log(`${rows.length} games since ${startIso}.`);
  const statsById = process.argv.includes("--no-stats")
    ? new Map<string, MajsoulGameStats>()
    : await loadStats(rows);

  for (const row of rows) {
    const payload = buildGameLogWebhookPayload(row, statsById.get(row.id) ?? null);
    const embed = payload.embeds![0];

    if (!post || !webhook) {
      console.log(`\n${embed.title}  <${embed.url}>\n${embed.description}`);
      for (const field of embed.fields ?? []) console.log(`${field.name}\n${field.value}`);
      continue;
    }

    const message = await postWebhookMessage(webhook, payload);
    console.log(`Posted ${embed.title} (${message.id})`);
    await sleep(POST_INTERVAL_MS);
  }

  console.log(post ? `\nPosted ${rows.length} games.` : "\nDry run — re-run with --post to send.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
