import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportedGameEntry } from "@/lib/imports/types";

export type DeletePlayerResult = {
  /** Session seat links removed (sessions and scores are kept). */
  sessionsUnlinked: number;
  /** Imports kept; entries unlinked from this player (scores and names preserved). */
  importsUnlinked: number;
};

/**
 * Remove a player profile without deleting game history.
 * - session_players rows cascade away; events and other players' scores stay.
 * - imported_games: keep rows and entries; clear player_id so leaderboard ignores them.
 */
export async function deletePlayerProfile(
  supabase: SupabaseClient,
  playerId: string
): Promise<DeletePlayerResult> {
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, display_name")
    .eq("id", playerId)
    .maybeSingle();

  if (playerErr) throw new Error(playerErr.message);
  if (!player) throw new Error("Player not found.");

  const { data: sessionLinks, error: linksErr } = await supabase
    .from("session_players")
    .select("session_id")
    .eq("player_id", playerId);

  if (linksErr) throw new Error(linksErr.message);

  const sessionsUnlinked = new Set((sessionLinks ?? []).map((row) => row.session_id)).size;

  const { data: imports, error: importsErr } = await supabase
    .from("imported_games")
    .select("id, entries_json");

  if (importsErr) throw new Error(importsErr.message);

  let importsUnlinked = 0;

  for (const row of imports ?? []) {
    const entries = (row.entries_json ?? []) as ImportedGameEntry[];
    if (!entries.some((entry) => entry.player_id === playerId)) continue;

    const nextEntries = entries.map((entry) => {
      if (entry.player_id !== playerId) return entry;
      return {
        display_name: entry.display_name || player.display_name,
        final_score: entry.final_score,
        ...(entry.is_ai ? { is_ai: true } : {}),
      };
    });

    const { error: updateErr } = await supabase
      .from("imported_games")
      .update({ entries_json: nextEntries })
      .eq("id", row.id);
    if (updateErr) throw new Error(updateErr.message);
    importsUnlinked += 1;
  }

  const { error: deletePlayerErr } = await supabase.from("players").delete().eq("id", playerId);
  if (deletePlayerErr) throw new Error(deletePlayerErr.message);

  return {
    sessionsUnlinked,
    importsUnlinked,
  };
}
