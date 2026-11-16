import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron/auth";
import { postDailyQuiz } from "@/lib/quiz/daily";
import { isScheduledQuizHour } from "@/lib/quiz/schedule";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Posts the day's scoring quiz. Called by Vercel Cron each morning. */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  // Scheduled at both UTC hours this can fall on (EDT and EST); only the run
  // that lands on the Eastern hour does anything. See isScheduledQuizHour.
  const at = new URL(req.url).searchParams.get("at");
  if (!isScheduledQuizHour(at)) {
    return NextResponse.json({
      ok: true,
      status: "skipped",
      reason: `Not ${at}:00 Eastern yet — the other daylight-saving run handles today.`,
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const result = await postDailyQuiz(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not post the quiz." },
      { status: 502 }
    );
  }
}
