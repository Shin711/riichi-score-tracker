import { NextResponse } from "next/server";

import { ensureMonthlyArchivesUpToDate } from "@/lib/leaderboard/monthly";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Archives completed months. Called by Vercel Cron on the 1st of each month. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const result = await ensureMonthlyArchivesUpToDate(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Archive failed" },
      { status: 500 }
    );
  }
}
