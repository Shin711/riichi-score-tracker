import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/server";

type Seat = "E" | "S" | "W" | "N";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shareId: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { shareId } = await ctx.params;
  const editKey = req.headers.get("x-edit-key");
  if (!editKey) {
    return NextResponse.json({ error: "Missing x-edit-key header." }, { status: 401 });
  }

  const body = (await req.json()) as { assignments: Partial<Record<Seat, string>> };
  const assignments = body.assignments ?? {};

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, edit_key")
    .eq("share_id", shareId)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 400 });
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.edit_key !== editKey) {
    return NextResponse.json({ error: "Invalid edit key." }, { status: 403 });
  }

  const rows = Object.entries(assignments)
    .filter(([, playerId]) => Boolean(playerId))
    .map(([seat, player_id]) => ({
      session_id: session.id,
      seat,
      player_id,
    }));

  const seatsToClear = (["E", "S", "W", "N"] as Seat[]).filter((seat) => !assignments[seat]);

  if (rows.length === 0 && seatsToClear.length === 0) {
    return NextResponse.json({ error: "No assignments provided." }, { status: 400 });
  }

  if (seatsToClear.length > 0) {
    const { error: clearErr } = await supabase
      .from("session_players")
      .delete()
      .eq("session_id", session.id)
      .in("seat", seatsToClear);
    if (clearErr) {
      return NextResponse.json({ error: clearErr.message }, { status: 400 });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("session_players")
    .upsert(rows, { onConflict: "session_id,seat" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
