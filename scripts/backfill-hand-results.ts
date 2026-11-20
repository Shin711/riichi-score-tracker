/**
 * Fills hand_results_json for Mahjong Soul games imported before that column
 * existed. Manual games (no record uuid) are left null. Games that already
 * have a hand list are skipped, including an empty list.
 *
 * Prints what it would save by default. Add --write to update the database.
 * Mahjong Soul throttles back-to-back replay fetches, so this pauses between
 * games and stops after two failures in a row.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-hand-results.ts [--write] [--limit N]
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import type { ImportedGameRow } from "../src/lib/imports/types";
import { handResultsFromWinningHands, type StoredHandResult } from "../src/lib/leaderboard/handResults";
import {
  isMajsoulLookupConfigured,
  withMajsoulSession,
  type MajsoulGameFetch,
} from "../src/lib/majsoul/client";
import { summarizeMajsoulRecord } from "../src/lib/majsoul/record";
import { alignMajsoulStatsToScores, computeMajsoulGameStats } from "../src/lib/majsoul/stats";

/** Mahjong Soul throttles an account that pulls replays back-to-back. */
const FETCH_INTERVAL_MS = 3_000;
/** Don't keep hammering an account that is being refused. */
const MAX_FETCH_FAILURES_IN_A_ROW = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function flagNumber(name: string): number | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} needs a positive whole number.`);
  }
  return value;
}

type BackfillRow = Pick<
  ImportedGameRow,
  "id" | "mjs_record_uuid" | "entries_json" | "played_at"
>;

function handsForRow(row: BackfillRow, game: MajsoulGameFetch): StoredHandResult[] | null {
  const stats = game.detail ? computeMajsoulGameStats(game.detail) : null;
  if (!stats) return null;
  const aligned = alignMajsoulStatsToScores(
    stats,
    summarizeMajsoulRecord(game.record).seats.map((seat) => seat.finalScore),
    (row.entries_json ?? []).map((entry) => entry.final_score)
  );
  if (!aligned) return null;
  return handResultsFromWinningHands(aligned.winningHands);
}

async function main() {
  const write = process.argv.includes("--write");
  const limit = flagNumber("--limit");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (see .env.local.example).");
  if (write && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to write hand results.");
  }
  if (!isMajsoulLookupConfigured()) {
    throw new Error("MAJSOUL_UID and MAJSOUL_TOKEN are required to read game logs.");
  }

  // supabase-js wants a WebSocket for realtime even though we never use it;
  // Node < 22 has none built in.
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });

  const { data, error } = await supabase
    .from("imported_games")
    .select("id, played_at, entries_json, mjs_record_uuid")
    .not("mjs_record_uuid", "is", null)
    .is("hand_results_json", null)
    .order("played_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as BackfillRow[]).filter((row) => row.mjs_record_uuid);
  const todo = limit ? rows.slice(0, limit) : rows;
  console.log(`${rows.length} Mahjong Soul games missing hand results. Reading ${todo.length}.`);
  if (!write) console.log("Dry run — nothing will be saved. Pass --write to update.");

  let saved = 0;
  let skipped = 0;
  await withMajsoulSession(async (fetchGame) => {
    let failuresInARow = 0;
    for (const row of todo) {
      const label = row.mjs_record_uuid;
      try {
        const hands = handsForRow(row, await fetchGame(row.mjs_record_uuid!));
        failuresInARow = 0;
        if (!hands) {
          skipped += 1;
          console.warn(`${label}: no usable hand list (left unset).`);
        } else if (!write) {
          console.log(`${label}: ${hands.length} hands`);
        } else {
          const { error: updateError } = await supabase
            .from("imported_games")
            .update({ hand_results_json: hands })
            .eq("id", row.id);
          if (updateError) throw new Error(updateError.message);
          saved += 1;
          console.log(`${label}: saved ${hands.length} hands`);
        }
      } catch (e) {
        console.warn(`${label}:`, e instanceof Error ? e.message : e);
        failuresInARow += 1;
        if (failuresInARow >= MAX_FETCH_FAILURES_IN_A_ROW) {
          console.warn("Mahjong Soul keeps refusing — stopping.");
          return;
        }
      }
      await sleep(FETCH_INTERVAL_MS);
    }
  });

  if (write) console.log(`Saved ${saved}. Skipped ${skipped}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
