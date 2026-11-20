import { NextResponse } from "next/server";

import type { ImportedGameRow } from "@/lib/imports/types";
import { handResultsFromWinningHands, type StoredHandResult } from "@/lib/leaderboard/handResults";
import { getMonthPartsInTimezone, getMonthPeriodBounds } from "@/lib/leaderboard/timezone";
import {
  isMajsoulLookupConfigured,
  MajsoulError,
  withMajsoulSession,
  type MajsoulGameFetch,
} from "@/lib/majsoul/client";
import { summarizeMajsoulRecord } from "@/lib/majsoul/record";
import { alignMajsoulStatsToScores, computeMajsoulGameStats } from "@/lib/majsoul/stats";
import { checkMajsoulAccountRateLimit } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Match MJS_ACCOUNT_MINUTE_LIMIT (4/min) so backfills do not trip error 540. */
const FETCH_INTERVAL_MS = 15_000;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 4;
const MAX_FAILURES_IN_A_ROW = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BackfillRow = Pick<ImportedGameRow, "id" | "mjs_record_uuid" | "entries_json">;

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

/**
 * Fills `hand_results_json` for imported Mahjong Soul games in small batches so
 * each call finishes within serverless limits without pulling credentials locally.
 *
 * Defaults to the current Eastern leaderboard month (`?scope=all` for everything).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Set CRON_SECRET to use this endpoint." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  if (!isMajsoulLookupConfigured()) {
    return NextResponse.json(
      { error: "MAJSOUL_UID and MAJSOUL_TOKEN are not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "month";
  const afterId = url.searchParams.get("afterId")?.trim() || null;
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit || DEFAULT_LIMIT));

  let query = supabase
    .from("imported_games")
    .select("id, entries_json, mjs_record_uuid", { count: "exact" })
    .not("mjs_record_uuid", "is", null)
    .is("hand_results_json", null)
    .order("id", { ascending: true });

  if (scope === "month") {
    const { year, month } = getMonthPartsInTimezone(new Date());
    const bounds = getMonthPeriodBounds(year, month);
    query = query.gte("played_at", bounds.startIso).lt("played_at", bounds.endIso);
  }
  if (afterId) query = query.gt("id", afterId);

  const { data, error, count } = await query.limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as BackfillRow[]).filter((row) => row.mjs_record_uuid);
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, saved: 0, skipped: 0, failed: 0, remaining: 0, lastId: null });
  }

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = null;
  let stoppedError: string | null = null;

  try {
    await withMajsoulSession(async (fetchGame) => {
      let failuresInARow = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const rate = await checkMajsoulAccountRateLimit(supabase);
        if (!rate.allowed) {
          stoppedError = `Account rate limit reached; retry in ${rate.retryAfterSeconds ?? 60}s.`;
          return;
        }
        const row = rows[i];
        lastId = row.id;
        try {
          const hands = handsForRow(row, await fetchGame(row.mjs_record_uuid!));
          failuresInARow = 0;
          if (!hands) {
            skipped += 1;
          } else {
            const { error: updateError } = await supabase
              .from("imported_games")
              .update({ hand_results_json: hands })
              .eq("id", row.id);
            if (updateError) throw new Error(updateError.message);
            saved += 1;
          }
        } catch (err) {
          failed += 1;
          failuresInARow += 1;
          stoppedError = err instanceof Error ? err.message : String(err);
          if (err instanceof MajsoulError && err.code === 540) return;
          if (failuresInARow >= MAX_FAILURES_IN_A_ROW) return;
        }
        if (i + 1 < rows.length) await sleep(FETCH_INTERVAL_MS);
      }
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        saved,
        skipped,
        failed,
        lastId,
        error: err instanceof Error ? err.message : "Mahjong Soul session failed.",
      },
      { status: 502 }
    );
  }

  const totalBefore = count ?? rows.length;
  const remaining = Math.max(0, totalBefore - saved - skipped - failed);

  return NextResponse.json({
    ok: stoppedError === null || saved > 0,
    saved,
    skipped,
    failed,
    remaining,
    lastId,
    ...(stoppedError ? { lastError: stoppedError } : {}),
  });
}
