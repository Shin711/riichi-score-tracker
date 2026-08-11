import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/api/bearerAuth";
import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { parseMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { resolveImportPlayers } from "@/lib/imports/resolvePlayers";
import { humanImportEntries, importSeatWindLabel } from "@/lib/imports/types";
import type { ImportedGameRow } from "@/lib/imports/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type ImportBody = {
  playedAt?: string;
  startingPoints?: number;
  mjsPaipuUrl?: string;
  seats?: Array<{
    playerId?: string;
    displayName?: string;
    finalScore?: number;
    isAi?: boolean;
  }>;
};

const DEFAULT_IMPORT_PAGE_SIZE = 10;
const MAX_IMPORT_PAGE_SIZE = 50;

function parseImportListParams(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = Number.parseInt(
    url.searchParams.get("pageSize") ?? String(DEFAULT_IMPORT_PAGE_SIZE),
    10
  );
  const pageSize = Math.min(
    MAX_IMPORT_PAGE_SIZE,
    Math.max(1, requestedPageSize || DEFAULT_IMPORT_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { page, pageSize, from, to } = parseImportListParams(new URL(req.url));

  const { data, error, count } = await supabase
    .from("imported_games")
    .select("id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at, imported_by_user_id", {
      count: "exact",
    })
    .order("played_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return NextResponse.json({
    imports: (data ?? []) as ImportedGameRow[],
    page,
    pageSize,
    total,
    totalPages,
  });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as ImportBody;
  const seats = body.seats ?? [];

  if (seats.length !== 4) {
    return NextResponse.json({ error: "Provide exactly four player scores." }, { status: 400 });
  }

  const playedAt = body.playedAt ? new Date(body.playedAt) : new Date();
  if (Number.isNaN(playedAt.getTime())) {
    return NextResponse.json({ error: "Invalid played-at date." }, { status: 400 });
  }

  const startingPoints =
    typeof body.startingPoints === "number" && body.startingPoints > 0
      ? Math.round(body.startingPoints)
      : 25000;

  let mjsPaipuUrl: string | null = null;
  let mjsRecordUuid: string | null = null;
  if (body.mjsPaipuUrl?.trim()) {
    const parsed = parseMjsPaipuUrl(body.mjsPaipuUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid Mahjong Soul log link." }, { status: 400 });
    }
    mjsPaipuUrl = parsed.paipuUrl;
    mjsRecordUuid = parsed.recordUuid;
  }

  if (mjsRecordUuid) {
    const { data: dupe } = await supabase
      .from("imported_games")
      .select("id")
      .eq("mjs_record_uuid", mjsRecordUuid)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json(
        { error: "This Mahjong Soul log was already imported." },
        { status: 409 }
      );
    }
  }

  try {
    const importedByUserId = await getUserIdFromRequest(req, supabase);

    const entries = await resolveImportPlayers(
      supabase,
      seats.map((s, index) => ({
        playerId: s.playerId,
        displayName: s.displayName ?? "",
        finalScore: Number(s.finalScore),
        isAi: s.isAi === true,
        windLabel: importSeatWindLabel(index),
      }))
    );

    if (humanImportEntries({ entries_json: entries }).length < 2) {
      return NextResponse.json({ error: "At least two human seats are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("imported_games")
      .insert({
        played_at: playedAt.toISOString(),
        starting_points: startingPoints,
        entries_json: entries,
        mjs_paipu_url: mjsPaipuUrl,
        mjs_record_uuid: mjsRecordUuid,
        imported_by_user_id: importedByUserId,
      })
      .select("id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at, imported_by_user_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    refreshDiscordLeaderboardAfterResponse();

    return NextResponse.json({ import: data as ImportedGameRow });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to import game" },
      { status: 400 }
    );
  }
}
