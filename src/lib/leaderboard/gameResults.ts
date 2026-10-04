import type { ImportedGameEntry, ImportedGameRow } from "@/lib/imports/types";
import { umaAdjustments } from "@/lib/leaderboard/placement";
import { gameScoreDelta, leaderboardPoints } from "@/lib/leaderboard/points";
import { usesLeaderboardSeasonScoring } from "@/lib/leaderboard/qualification";
import { getMonthPartsInTimezone } from "@/lib/leaderboard/timezone";

export type ImportedGameSeatResult = ImportedGameEntry & {
  /** Stored seat order (0 = East). */
  seatIndex: number;
  /** 1–4 among every seat (AI included); ties go to the seat closer to East. */
  placement: number;
  /** (ending − starting) ÷ 1,000. */
  score: number;
  /** Uma in leaderboard points, or null for games before the October 2026 season. */
  uma: number | null;
  /** What this game adds to the leaderboard: score + uma. */
  net: number;
};

/** True when a game played at this time counts with uma (October 2026 season on). */
export function gameUsesUma(playedAt: string): boolean {
  const { year, month } = getMonthPartsInTimezone(new Date(playedAt));
  return usesLeaderboardSeasonScoring(year, month);
}

/**
 * Per-seat leaderboard breakdown for one imported game, in placement order.
 * Scored the same way as mergeImportedGamesIntoLeaderboard.
 */
export function importedGameResults(
  row: Pick<ImportedGameRow, "entries_json" | "starting_points" | "played_at">
): { usesUma: boolean; seats: ImportedGameSeatResult[] } {
  const entries = row.entries_json ?? [];
  const usesUma = gameUsesUma(row.played_at);
  const umas = umaAdjustments(entries.map((e) => e.final_score));

  const seats = entries
    .map((entry, seatIndex) => {
      const score = leaderboardPoints(gameScoreDelta(entry.final_score, row.starting_points));
      const uma = usesUma ? umas[seatIndex] : null;
      return { ...entry, seatIndex, placement: 0, score, uma, net: score + (uma ?? 0) };
    })
    .sort((a, b) => b.final_score - a.final_score || a.seatIndex - b.seatIndex);
  seats.forEach((seat, index) => {
    seat.placement = index + 1;
  });

  return { usesUma, seats };
}
