import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";

/** Minimum finished games in the period before a player appears on the ranked board. */
export const LEADERBOARD_MIN_GAMES_FOR_RANK = 3;

export function isLeaderboardRanked(
  entry: Pick<LeaderboardEntry, "gamesPlayed">
): boolean {
  return entry.gamesPlayed >= LEADERBOARD_MIN_GAMES_FOR_RANK;
}

export function gamesUntilLeaderboardRank(gamesPlayed: number): number {
  return Math.max(0, LEADERBOARD_MIN_GAMES_FOR_RANK - gamesPlayed);
}

export function compareLeaderboardEntries(
  a: LeaderboardEntry,
  b: LeaderboardEntry
): number {
  return (
    b.points - a.points ||
    b.gamesPlayed - a.gamesPlayed ||
    a.displayName.localeCompare(b.displayName)
  );
}

export function splitLeaderboardEntries(entries: LeaderboardEntry[]): {
  ranked: LeaderboardEntry[];
  unranked: LeaderboardEntry[];
  inactive: LeaderboardEntry[];
} {
  const ranked: LeaderboardEntry[] = [];
  const unranked: LeaderboardEntry[] = [];
  const inactive: LeaderboardEntry[] = [];

  for (const entry of entries) {
    if (entry.gamesPlayed === 0) inactive.push(entry);
    else if (isLeaderboardRanked(entry)) ranked.push(entry);
    else unranked.push(entry);
  }

  ranked.sort(compareLeaderboardEntries);
  unranked.sort(compareLeaderboardEntries);
  inactive.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { ranked, unranked, inactive };
}
