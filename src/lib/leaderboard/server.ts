import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeLeaderboard,
  groupSessionSnapshots,
} from "@/lib/leaderboard/computeLeaderboard";
import {
  formatMonthLabel,
  getMonthPartsInTimezone,
  getMonthPeriodBounds,
} from "@/lib/leaderboard/timezone";

export async function buildLeaderboardForPeriod(
  supabase: SupabaseClient,
  periodStartIso: string,
  periodEndIso: string
) {
  const [sessionsRes, playersRes, sessionPlayersRes, eventsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, rules_json, ended_at")
      .not("ended_at", "is", null)
      .gte("ended_at", periodStartIso)
      .lt("ended_at", periodEndIso),
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
  if (firstError) throw new Error(firstError.message);

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

  return {
    entries,
    gamesWithPlayers: snapshots.filter((s) => s.assignments.length > 0).length,
  };
}

export async function buildCurrentMonthLeaderboard(supabase: SupabaseClient, now = new Date()) {
  const { year, month } = getMonthPartsInTimezone(now);
  const { startIso, endIso } = getMonthPeriodBounds(year, month);
  const result = await buildLeaderboardForPeriod(supabase, startIso, endIso);
  return {
    ...result,
    period: {
      year,
      month,
      label: formatMonthLabel(year, month),
    },
  };
}
