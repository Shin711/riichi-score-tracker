import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/api/bearerAuth";
import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { parseMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { resolveImportPlayers } from "@/lib/imports/resolvePlayers";
import { humanImportEntries, importSeatWindLabel } from "@/lib/imports/types";
import type { ImportedGameRow } from "@/lib/imports/types";
import {
  fetchMajsoulGameRecord,
  isMajsoulLookupConfigured,
  MajsoulError,
  MajsoulNotConfiguredError,
} from "@/lib/majsoul/client";
import { MajsoulRecordShapeError, summarizeMajsoulRecord } from "@/lib/majsoul/record";
import { checkMajsoulImportRateLimit, rateLimitRetryAfterSeconds } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/requestIp";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** A cold Mahjong Soul login plus the record fetch runs ~3-6s. */
export const maxDuration = 30;

const IMPORT_SELECT =
  "id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at, imported_by_user_id";

type MjsImportBody = { input?: string };

/** Reports whether server-side Mahjong Soul lookup is available. */
export async function GET() {
  return NextResponse.json({ configured: isMajsoulLookupConfigured() });
}

/**
 * Import a finished Mahjong Soul game straight from its id or share link.
 *
 * Players are matched to existing club players by nickname (and created when
 * missing) via the same path the manual importer uses.
 */
export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as MjsImportBody;
  const input = body.input?.trim();
  if (!input) {
    return NextResponse.json(
      { error: "Paste a Mahjong Soul game ID or share link." },
      { status: 400 }
    );
  }

  const parsed = parseMjsPaipuUrl(input);
  if (!parsed) {
    return NextResponse.json(
      { error: "That doesn't look like a Mahjong Soul game ID or log link." },
      { status: 400 }
    );
  }

  // Cheap duplicate check before spending a Mahjong Soul login.
  const { data: existing } = await supabase
    .from("imported_games")
    .select("id")
    .eq("mjs_record_uuid", parsed.recordUuid)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "This Mahjong Soul game was already imported." },
      { status: 409 }
    );
  }

  try {
    const { allowed, reason } = await checkMajsoulImportRateLimit(supabase, getClientIp(req));
    if (!allowed && reason) {
      return NextResponse.json(
        { error: "Too many Mahjong Soul lookups. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimitRetryAfterSeconds(reason)) } }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Rate limit check failed." },
      { status: 500 }
    );
  }

  try {
    const record = await fetchMajsoulGameRecord(parsed.recordUuid);
    const summary = summarizeMajsoulRecord(record);

    const entries = await resolveImportPlayers(
      supabase,
      summary.seats.map((seat) => ({
        displayName: seat.nickname,
        finalScore: seat.finalScore,
        isAi: seat.isAi,
        windLabel: importSeatWindLabel(seat.seat),
      }))
    );

    if (humanImportEntries({ entries_json: entries }).length < 2) {
      return NextResponse.json(
        { error: "That game has fewer than two human players, so it can't be ranked." },
        { status: 400 }
      );
    }

    const importedByUserId = await getUserIdFromRequest(req, supabase);

    const { data, error } = await supabase
      .from("imported_games")
      .insert({
        played_at: summary.playedAt.toISOString(),
        starting_points: summary.startingPoints,
        entries_json: entries,
        mjs_paipu_url: parsed.paipuUrl,
        mjs_record_uuid: summary.recordUuid || parsed.recordUuid,
        imported_by_user_id: importedByUserId,
      })
      .select(IMPORT_SELECT)
      .single();

    if (error) {
      // Unique index on mjs_record_uuid — a concurrent import beat us here.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This Mahjong Soul game was already imported." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    refreshDiscordLeaderboardAfterResponse();

    return NextResponse.json({ import: data as ImportedGameRow });
  } catch (e) {
    if (e instanceof MajsoulNotConfiguredError) {
      return NextResponse.json(
        {
          error:
            "Mahjong Soul lookup isn't set up on this server. Add MAJSOUL_UID and MAJSOUL_TOKEN, or enter the game manually.",
        },
        { status: 503 }
      );
    }
    if (e instanceof MajsoulError) {
      if (e.code === 1203) {
        return NextResponse.json({ error: e.message }, { status: 404 });
      }
      // Credential/account problems are ours to fix, not the caller's.
      const isCredentialProblem = [109, 110, 151, 503, 1002, 1005, 1006].includes(e.code);
      return NextResponse.json({ error: e.message }, { status: isCredentialProblem ? 503 : 502 });
    }
    if (e instanceof MajsoulRecordShapeError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to import from Mahjong Soul." },
      { status: 500 }
    );
  }
}
