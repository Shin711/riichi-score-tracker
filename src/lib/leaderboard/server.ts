import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportedGameRow } from "@/lib/imports/types";
import {
  computeLeaderboard,
  groupSessionSnapshots,
} from "@/lib/leaderboard/computeLeaderboard";
import { mergeImportedGamesIntoLeaderboard } from "@/lib/leaderboard/mergeImports";
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
  const sessionsRes = await supabase
    .from("sessions")
    .select("id, rules_json, ended_at")
    .not("ended_at", "is", null)
    .gte("ended_at", periodStartIso)
    .lt("ended_at", periodEndIso);

  if (sessionsRes.error) throw new Error(sessionsRes.error.message);

  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id);

  const [playersRes, sessionPlayersRes, eventsRes, importsRes] = await Promise.all([
    supabase.from("players").select("id, display_name"),
    sessionIds.length > 0
      ? supabase
          .from("session_players")
          .select("session_id, seat, player_id, players(display_name)")
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length > 0
      ? supabase
          .from("events")
          .select("session_id, type, payload_json, created_at")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("imported_games")
      .select("id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at")
      .gte("played_at", periodStartIso)
      .lt("played_at", periodEndIso),
  ]);

  const firstError =
    playersRes.error ?? sessionPlayersRes.error ?? eventsRes.error ?? importsRes.error;
  if (firstError) throw new Error(firstError.message);

  const snapshots = groupSessionSnapshots({
    sessions,
    sessionPlayers: sessionPlayersRes.data ?? [],
    events: eventsRes.data ?? [],
  });

  const sessionEntries = computeLeaderboard(
    snapshots,
    (playersRes.data ?? []).map((p) => ({
      id: p.id,
      display_name: p.display_name,
    }))
  );

  const imports = (importsRes.data ?? []) as ImportedGameRow[];
  const entries = mergeImportedGamesIntoLeaderboard(sessionEntries, imports);

  const sessionGames = snapshots.filter((s) => s.assignments.length > 0).length;

  return {
    entries,
    gamesWithPlayers: sessionGames + imports.length,
    sessionGames,
    importedGames: imports.length,
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
