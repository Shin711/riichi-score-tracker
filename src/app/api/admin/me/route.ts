import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/api/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return NextResponse.json({ isAdmin: false, signedIn: false });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ isAdmin: false, signedIn: false });
  }

  return NextResponse.json({
    signedIn: true,
    isAdmin: isAdminUser(userData.user),
    userId: userData.user.id,
    email: userData.user.email ?? null,
  });
}
