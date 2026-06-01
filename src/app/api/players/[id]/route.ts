import { NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/api/adminAuth";
import { deletePlayerProfile } from "@/lib/api/deletePlayer";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const playerId = id.trim();
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  }

  try {
    const result = await deletePlayerProfile(auth.supabase, playerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete player.";
    const status = message === "Player not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
