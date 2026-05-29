import { NextResponse } from "next/server";

import { ensureMonthlyArchivesUpToDate, mapArchiveRow } from "@/lib/leaderboard/monthly";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    await ensureMonthlyArchivesUpToDate(supabase);

    const { data, error } = await supabase
      .from("leaderboard_monthly_archives")
      .select("id, year, month, entries_json, games_count, archived_at")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const archives = (data ?? []).map(mapArchiveRow);
    return NextResponse.json({ archives });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load archives" },
      { status: 400 }
    );
  }
}
