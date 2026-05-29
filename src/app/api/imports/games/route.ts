import { NextResponse } from "next/server";

import { parseMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { resolveImportPlayers } from "@/lib/imports/resolvePlayers";
import { humanImportEntries } from "@/lib/imports/types";
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

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("imported_games")
    .select("id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at")
    .order("played_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ imports: (data ?? []) as ImportedGameRow[] });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as ImportBody;
  const seats = body.seats ?? [];

  if (seats.length !== 4) {
    return NextResponse.json({ error: "Provide exactly four seats (East, South, West, North)." }, { status: 400 });
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
    const seatLabels = ["East", "South", "West", "North"] as const;
    const entries = await resolveImportPlayers(
      supabase,
      seats.map((s, index) => ({
        playerId: s.playerId,
        displayName: s.displayName ?? "",
        finalScore: Number(s.finalScore),
        isAi: s.isAi === true,
        windLabel: seatLabels[index],
      }))
    );

    if (humanImportEntries({ entries_json: entries }).length === 0) {
      return NextResponse.json({ error: "At least one human seat is required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("imported_games")
      .insert({
        played_at: playedAt.toISOString(),
        starting_points: startingPoints,
        entries_json: entries,
        mjs_paipu_url: mjsPaipuUrl,
        mjs_record_uuid: mjsRecordUuid,
      })
      .select("id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ import: data as ImportedGameRow });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to import game" },
      { status: 400 }
    );
  }
}
