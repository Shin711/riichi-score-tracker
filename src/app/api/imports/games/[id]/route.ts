import { NextResponse } from "next/server";

import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { ImportBodyError, parseImportBody, type ImportBody } from "@/lib/imports/parseImportBody";
import type { ImportedGameRow } from "@/lib/imports/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const IMPORTED_GAME_COLUMNS =
  "id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at, imported_by_user_id";

/** Replace a recorded game's date, starting stack, log link and seats. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as ImportBody;

  try {
    const { data: existing, error: findErr } = await supabase
      .from("imported_games")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 });
    if (!existing) return NextResponse.json({ error: "Game not found." }, { status: 404 });

    const game = await parseImportBody(supabase, body, id);

    const { data, error } = await supabase
      .from("imported_games")
      .update(game)
      .eq("id", id)
      .select(IMPORTED_GAME_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    refreshDiscordLeaderboardAfterResponse();

    return NextResponse.json({ import: data as ImportedGameRow });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update game" },
      { status: e instanceof ImportBodyError ? e.status : 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await ctx.params;
  const { error } = await supabase.from("imported_games").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  refreshDiscordLeaderboardAfterResponse();

  return NextResponse.json({ ok: true });
}
