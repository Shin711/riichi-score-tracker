/** Matches Riichi Leaderboard.xlsx: net point totals are shown in thousands. */
export const LEADERBOARD_POINTS_DIVISOR = 1000;

/** Raw score delta (ending − starting) for one game. */
export function gameScoreDelta(endingScore: number, startingPoints: number): number {
  return endingScore - startingPoints;
}

/** Cumulative leaderboard points (sum of deltas ÷ 1,000). */
export function leaderboardPoints(totalDelta: number): number {
  return totalDelta / LEADERBOARD_POINTS_DIVISOR;
}

/**
 * Confidence weighting (shrinkage) constant: the number of "phantom" games at
 * zero that a player's record is regressed toward. Higher = small samples are
 * trusted less. With K, a player keeps games / (games + K) of their raw total.
 */
export const LEADERBOARD_CONFIDENCE_K = 5;

/** Fraction of a player's raw total that counts, given how many games they've played. */
export function leaderboardConfidenceWeight(gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0;
  return gamesPlayed / (gamesPlayed + LEADERBOARD_CONFIDENCE_K);
}

/**
 * Rating used for ranking: confidence-weighted net total.
 * Pulls low-game players toward 0 so a lucky short run can't outrank a proven
 * record. With the same net, more games means a higher rating (the grinder
 * isn't punished for playing more).
 */
export function adjustedLeaderboardPoints(points: number, gamesPlayed: number): number {
  return points * leaderboardConfidenceWeight(gamesPlayed);
}

/** Per-game average net points (net ÷ games). One outlier matters less as games grow. */
export function leaderboardAveragePoints(points: number, gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0;
  return points / gamesPlayed;
}

/** Format a points-scale value with a sign (e.g. +25.6, -27.2, 0). */
export function formatPointsValue(points: number, decimals = 1): string {
  if (Object.is(points, -0) || points === 0) return "0";
  const formatted = points.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return points > 0 ? `+${formatted}` : formatted;
}

/** Format like the spreadsheet (e.g. 25.6, -27.2). */
export function formatLeaderboardPoints(totalDelta: number): string {
  return formatPointsValue(leaderboardPoints(totalDelta));
}

/** Format the confidence-weighted rating used for ranking. */
export function formatLeaderboardRating(points: number, gamesPlayed: number): string {
  return formatPointsValue(adjustedLeaderboardPoints(points, gamesPlayed));
}

/** Format per-game average net points. */
export function formatLeaderboardAverage(points: number, gamesPlayed: number): string {
  return formatPointsValue(leaderboardAveragePoints(points, gamesPlayed), 2);
}
