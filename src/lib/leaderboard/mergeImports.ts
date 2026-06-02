import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";
import { gameScoreDelta, LEADERBOARD_POINTS_DIVISOR } from "@/lib/leaderboard/points";
import { compareLeaderboardEntries } from "@/lib/leaderboard/qualification";
import { isHumanImportEntry } from "@/lib/imports/types";
import type { ImportedGameRow } from "@/lib/imports/types";

export function mergeImportedGamesIntoLeaderboard(
  entries: LeaderboardEntry[],
  imports: ImportedGameRow[]
): LeaderboardEntry[] {
  const byPlayer = new Map<string, LeaderboardEntry>();

  for (const entry of entries) {
    byPlayer.set(entry.playerId, { ...entry });
  }

  for (const game of imports) {
    const players = (game.entries_json ?? []).filter(isHumanImportEntry);
    if (players.length === 0) continue;

    for (const row of players) {
      const delta = gameScoreDelta(row.final_score, game.starting_points);
      let entry = byPlayer.get(row.player_id);
      if (!entry) {
        entry = {
          playerId: row.player_id,
          displayName: row.display_name,
          gamesPlayed: 0,
          totalDelta: 0,
          points: 0,
        };
        byPlayer.set(row.player_id, entry);
      }
      entry.displayName = row.display_name;
      entry.gamesPlayed += 1;
      entry.totalDelta += delta;
    }
  }

  return Array.from(byPlayer.values())
    .map((entry) => ({
      ...entry,
      points: entry.totalDelta / LEADERBOARD_POINTS_DIVISOR,
    }))
    .sort(compareLeaderboardEntries);
}
