import { NextResponse } from "next/server";

import { getSessionForEdit } from "@/lib/api/sessionEdit";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type EventBody = { type?: string; payload?: Record<string, unknown> };

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

  const body = (await req.json().catch(() => ({}))) as EventBody;
  if (!body.type) {
    return NextResponse.json({ error: "Missing event type." }, { status: 400 });
  }
  if (!body.payload || typeof body.payload !== "object") {
    return NextResponse.json({ error: "Missing event payload." }, { status: 400 });
  }

  const sessionResult = await getSessionForEdit(supabase, shareId, editKey);
  if ("error" in sessionResult) {
    return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status });
  }
  const session = sessionResult.session;

  const { data, error } = await supabase
    .from("events")
    .insert({
      session_id: session.id,
      type: body.type,
      payload_json: body.payload,
    })
    .select("id, session_id, type, payload_json, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ event: data });
}

export async function DELETE(
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

  const sessionResult = await getSessionForEdit(supabase, shareId, editKey);
  if ("error" in sessionResult) {
    return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status });
  }
  const session = sessionResult.session;

  const { data: lastEvent, error: lastErr } = await supabase
    .from("events")
    .select("id")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    return NextResponse.json({ error: lastErr.message }, { status: 400 });
  }
  if (!lastEvent) {
    return NextResponse.json({ error: "No event to undo." }, { status: 404 });
  }

  const { error: deleteErr } = await supabase
    .from("events")
    .delete()
    .eq("id", lastEvent.id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, deletedEventId: lastEvent.id });
}
