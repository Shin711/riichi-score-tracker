import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/api/bearerAuth";
import type { ImportedGameRow } from "@/lib/imports/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const userId = await getUserIdFromRequest(req, supabase);
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your imported games." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("imports_for_user", { p_user_id: userId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ imports: (data ?? []) as ImportedGameRow[] });
}
