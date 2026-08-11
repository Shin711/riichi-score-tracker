import { NextResponse } from "next/server";

import { syncDiscordLeaderboardMessage } from "@/lib/discord/postLeaderboard";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Manually re-posts the standings to Discord (first post, or after fixing the
 * channel by hand). Game entry refreshes the message on its own.
 *
 * Unlike the cron routes this always demands CRON_SECRET: an open endpoint here
 * would let anyone churn a public channel.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Set CRON_SECRET to use this endpoint." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const result = await syncDiscordLeaderboardMessage(supabase);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to post the leaderboard." },
      { status: 502 }
    );
  }
}
