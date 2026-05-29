import { NextResponse } from "next/server";

import { ensureMonthlyArchivesUpToDate } from "@/lib/leaderboard/monthly";
import { buildCurrentMonthLeaderboard } from "@/lib/leaderboard/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    await ensureMonthlyArchivesUpToDate(supabase);
    const { entries, gamesWithPlayers, period } = await buildCurrentMonthLeaderboard(supabase);

    return NextResponse.json({
      entries,
      gamesWithPlayers,
      period,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load leaderboard" },
      { status: 400 }
    );
  }
}
