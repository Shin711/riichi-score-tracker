import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron/auth";
import { revealDailyQuiz } from "@/lib/quiz/daily";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Reveals the open quiz and closes answering. Called by Vercel Cron each evening. */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const result = await revealDailyQuiz(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not reveal the quiz." },
      { status: 502 }
    );
  }
}
