import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";
import { adjustedLeaderboardPoints } from "@/lib/leaderboard/points";

/** Rating-based ranking begins with this calendar month (US Eastern). */
export const LEADERBOARD_RATING_START_YEAR = 2026;
export const LEADERBOARD_RATING_START_MONTH = 7;

/** Minimum games before appearing on the board (legacy net-points months). */
export const LEADERBOARD_MIN_GAMES_FOR_RANK_LEGACY = 3;

/** Minimum games before appearing on the board (rating months). */
export const LEADERBOARD_MIN_GAMES_FOR_RANK = 5;

export type LeaderboardScoringPeriod = {
  year: number;
  month: number;
};

export function usesLeaderboardRating(year: number, month: number): boolean {
  if (year > LEADERBOARD_RATING_START_YEAR) return true;
  if (year === LEADERBOARD_RATING_START_YEAR && month >= LEADERBOARD_RATING_START_MONTH) {
    return true;
  }
  return false;
}

export function minGamesForLeaderboardRank(year: number, month: number): number {
  return usesLeaderboardRating(year, month)
    ? LEADERBOARD_MIN_GAMES_FOR_RANK
    : LEADERBOARD_MIN_GAMES_FOR_RANK_LEGACY;
}

export function getLeaderboardScoringOptions(period: LeaderboardScoringPeriod) {
  const useRating = usesLeaderboardRating(period.year, period.month);
  return {
    useRating,
    minGamesForRank: minGamesForLeaderboardRank(period.year, period.month),
  };
}

export function isLeaderboardRanked(
  entry: Pick<LeaderboardEntry, "gamesPlayed">,
  minGamesForRank: number
): boolean {
  return entry.gamesPlayed >= minGamesForRank;
}

export function gamesUntilLeaderboardRank(
  gamesPlayed: number,
  minGamesForRank: number
): number {
  return Math.max(0, minGamesForRank - gamesPlayed);
}

export function compareLeaderboardEntries(
  a: LeaderboardEntry,
  b: LeaderboardEntry,
  options: { useRating: boolean }
): number {
  if (options.useRating) {
    return (
      adjustedLeaderboardPoints(b.points, b.gamesPlayed) -
        adjustedLeaderboardPoints(a.points, a.gamesPlayed) ||
      b.points - a.points ||
      b.gamesPlayed - a.gamesPlayed ||
      a.displayName.localeCompare(b.displayName)
    );
  }

  return (
    b.points - a.points ||
    b.gamesPlayed - a.gamesPlayed ||
    a.displayName.localeCompare(b.displayName)
  );
}

export function splitLeaderboardEntries(
  entries: LeaderboardEntry[],
  period: LeaderboardScoringPeriod
): {
  ranked: LeaderboardEntry[];
  unranked: LeaderboardEntry[];
  inactive: LeaderboardEntry[];
} {
  const { useRating, minGamesForRank } = getLeaderboardScoringOptions(period);
  const ranked: LeaderboardEntry[] = [];
  const unranked: LeaderboardEntry[] = [];
  const inactive: LeaderboardEntry[] = [];

  for (const entry of entries) {
    if (entry.gamesPlayed === 0) inactive.push(entry);
    else if (isLeaderboardRanked(entry, minGamesForRank)) ranked.push(entry);
    else unranked.push(entry);
  }

  const compare = (a: LeaderboardEntry, b: LeaderboardEntry) =>
    compareLeaderboardEntries(a, b, { useRating });

  ranked.sort(compare);
  unranked.sort(compare);
  inactive.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { ranked, unranked, inactive };
}
