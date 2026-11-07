import {
  sortLeaderboardEntries,
  type LeaderboardComputeOptions,
  type LeaderboardEntry,
} from "@/lib/leaderboard/computeLeaderboard";
import { umaAdjustments } from "@/lib/leaderboard/placement";
import { chomboAdjustments, gameScoreDelta } from "@/lib/leaderboard/points";
import { importEntryChombo, isHumanImportEntry } from "@/lib/imports/types";
import type { ImportedGameRow } from "@/lib/imports/types";

export function mergeImportedGamesIntoLeaderboard(
  entries: LeaderboardEntry[],
  imports: ImportedGameRow[],
  options?: LeaderboardComputeOptions
): LeaderboardEntry[] {
  const byPlayer = new Map<string, LeaderboardEntry>();

  for (const entry of entries) {
    byPlayer.set(entry.playerId, { ...entry });
  }

  for (const game of imports) {
    const seats = game.entries_json ?? [];
    if (!seats.some(isHumanImportEntry)) continue;

    // Placement is among every seat (AI included), in stored seat order (East first).
    const bonuses = options?.usePlacementBonus
      ? umaAdjustments(seats.map((seat) => seat.final_score))
      : null;
    const chombos = seats.map(importEntryChombo);
    const chomboDeltas = chombos.some((count) => count > 0) ? chomboAdjustments(chombos) : null;

    seats.forEach((row, seatIndex) => {
      if (!isHumanImportEntry(row)) return;
      const delta = gameScoreDelta(row.final_score, game.starting_points);
      let entry = byPlayer.get(row.player_id);
      if (!entry) {
        entry = {
          playerId: row.player_id,
          displayName: row.display_name,
          gamesPlayed: 0,
          totalDelta: 0,
          placementBonus: 0,
          points: 0,
        };
        byPlayer.set(row.player_id, entry);
      }
      entry.displayName = row.display_name;
      entry.gamesPlayed += 1;
      entry.totalDelta += delta;
      if (bonuses) {
        entry.placementBonus = (entry.placementBonus ?? 0) + bonuses[seatIndex];
      }
      if (chomboDeltas) {
        entry.chomboAdjustment = (entry.chomboAdjustment ?? 0) + chomboDeltas[seatIndex];
        if (chombos[seatIndex] > 0) {
          entry.chomboCount = (entry.chomboCount ?? 0) + chombos[seatIndex];
        }
      }
    });
  }

  return sortLeaderboardEntries(Array.from(byPlayer.values()), options);
}
