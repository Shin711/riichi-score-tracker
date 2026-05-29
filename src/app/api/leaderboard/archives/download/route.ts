import { NextResponse } from "next/server";

import {
  archiveDownloadFilename,
  archiveToCsv,
  ensureMonthlyArchivesUpToDate,
  mapArchiveRow,
} from "@/lib/leaderboard/monthly";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month." }, { status: 400 });
  }

  try {
    await ensureMonthlyArchivesUpToDate(supabase);

    const { data, error } = await supabase
      .from("leaderboard_monthly_archives")
      .select("id, year, month, entries_json, games_count, archived_at")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) {
      return NextResponse.json({ error: "Archive not found for that month." }, { status: 404 });
    }

    const archive = mapArchiveRow(data);
    const filename = archiveDownloadFilename(archive, format);

    if (format === "json") {
      return new NextResponse(JSON.stringify(archive, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return new NextResponse(archiveToCsv(archive), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to download archive" },
      { status: 400 }
    );
  }
}
