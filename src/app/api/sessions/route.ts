import { NextResponse } from "next/server";

import { randomBase64Url } from "@/lib/ids";
import { defaultRules } from "@/lib/scoring/ledger";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  let ownerUserId: string | null = null;
  if (token) {
    const { data: userData } = await supabase.auth.getUser(token);
    ownerUserId = userData.user?.id ?? null;
  }
  const shareId = randomBase64Url(12);
  const editKey = randomBase64Url(18);
  const title = body.title?.trim() || "Riichi session";
  const rules_json = defaultRules();

  const { data, error } = await supabase
    .from("sessions")
    .insert({ share_id: shareId, title, rules_json, edit_key: editKey, owner_user_id: ownerUserId })
    .select("id, share_id, title, rules_json, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ session: data, editKey });
}
