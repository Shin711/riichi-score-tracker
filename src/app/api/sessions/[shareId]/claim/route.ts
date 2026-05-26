import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shareId: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization bearer token." }, { status: 401 });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: userErr?.message ?? "Invalid token." }, { status: 401 });
  }

  const { shareId } = await ctx.params;
  const body = (await req.json()) as { editKey?: string };
  const editKey = body.editKey?.trim();
  if (!editKey) {
    return NextResponse.json({ error: "Missing editKey." }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, edit_key, owner_user_id")
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
  if (session.owner_user_id && session.owner_user_id !== userData.user.id) {
    return NextResponse.json({ error: "Session already claimed by another account." }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ owner_user_id: userData.user.id })
    .eq("id", session.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
