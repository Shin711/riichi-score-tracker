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
 * Confidence-adjusted points used for ranking. Pulls low-game players toward 0
 * so a lucky short run can't outrank a proven record. Converges to the raw
 * points as games played grows.
 */
export function adjustedLeaderboardPoints(points: number, gamesPlayed: number): number {
  return points * leaderboardConfidenceWeight(gamesPlayed);
}

/** Format a points-scale value with a sign (e.g. +25.6, -27.2, 0). */
export function formatPointsValue(points: number): string {
  if (Object.is(points, -0) || points === 0) return "0";
  const formatted = points.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return points > 0 ? `+${formatted}` : formatted;
}

/** Format like the spreadsheet (e.g. 25.6, -27.2). */
export function formatLeaderboardPoints(totalDelta: number): string {
  return formatPointsValue(leaderboardPoints(totalDelta));
}

/** Format the confidence-weighted rating for a player's record. */
export function formatLeaderboardRating(points: number, gamesPlayed: number): string {
  return formatPointsValue(adjustedLeaderboardPoints(points, gamesPlayed));
}
