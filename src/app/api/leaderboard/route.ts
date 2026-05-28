import { NextResponse } from "next/server";

import {
  computeLeaderboard,
  groupSessionSnapshots,
} from "@/lib/leaderboard/computeLeaderboard";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const [sessionsRes, playersRes, sessionPlayersRes, eventsRes] = await Promise.all([
    supabase.from("sessions").select("id, rules_json"),
    supabase.from("players").select("id, display_name"),
    supabase
      .from("session_players")
      .select("session_id, seat, player_id, players(display_name)"),
    supabase
      .from("events")
      .select("session_id, type, payload_json, created_at")
      .order("created_at", { ascending: true }),
  ]);

  const firstError =
    sessionsRes.error ?? playersRes.error ?? sessionPlayersRes.error ?? eventsRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  const snapshots = groupSessionSnapshots({
    sessions: sessionsRes.data ?? [],
    sessionPlayers: sessionPlayersRes.data ?? [],
    events: eventsRes.data ?? [],
  });

  const entries = computeLeaderboard(
    snapshots,
    (playersRes.data ?? []).map((p) => ({
      id: p.id,
      display_name: p.display_name,
    }))
  );

  const gamesWithPlayers = snapshots.filter((s) => s.assignments.length > 0).length;

  return NextResponse.json({
    entries,
    gamesWithPlayers,
    updatedAt: new Date().toISOString(),
  });
}
