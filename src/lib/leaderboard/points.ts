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

/** Format like the spreadsheet (e.g. 25.6, -27.2). */
export function formatLeaderboardPoints(totalDelta: number): string {
  const points = leaderboardPoints(totalDelta);
  if (Object.is(points, -0) || points === 0) return "0";
  return points.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
