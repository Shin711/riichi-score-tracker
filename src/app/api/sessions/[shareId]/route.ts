import { NextResponse } from "next/server";

import { getSessionForEdit } from "@/lib/api/sessionEdit";
import { DEFAULT_SESSION_TITLE } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shareId: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { shareId } = await ctx.params;

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, share_id, title, rules_json, created_at, owner_user_id, ended_at")
    .eq("share_id", shareId)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 400 });
  }
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: events, error: eventsErr } = await supabase
    .from("events")
    .select("id, session_id, type, payload_json, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  if (eventsErr) {
    return NextResponse.json({ error: eventsErr.message }, { status: 400 });
  }

  const { data: sessionPlayers, error: spErr } = await supabase
    .from("session_players")
    .select("seat, player_id, players(id, display_name)")
    .eq("session_id", session.id);

  if (spErr) {
    return NextResponse.json({ error: spErr.message }, { status: 400 });
  }

  return NextResponse.json({ session, events: events ?? [], sessionPlayers: sessionPlayers ?? [] });
}

export async function PATCH(
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

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    rules_json?: Record<string, unknown>;
    end?: boolean;
    reopen?: boolean;
  };

  const allowEnded = body.reopen === true;
  const sessionResult = await getSessionForEdit(supabase, shareId, editKey, { allowEnded });
  if ("error" in sessionResult) {
    return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status });
  }
  const session = sessionResult.session;

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim() || DEFAULT_SESSION_TITLE;
  if (body.rules_json && typeof body.rules_json === "object") updates.rules_json = body.rules_json;
  if (body.end === true) updates.ended_at = new Date().toISOString();
  if (body.reopen === true) updates.ended_at = null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }
  if (body.end && body.reopen) {
    return NextResponse.json({ error: "Cannot end and reopen in one request." }, { status: 400 });
  }
  if (body.end === true && session.ended_at) {
    return NextResponse.json({ error: "This game is already ended." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("sessions")
    .update(updates)
    .eq("id", session.id)
    .select("id, share_id, title, rules_json, created_at, ended_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ session: data });
}
