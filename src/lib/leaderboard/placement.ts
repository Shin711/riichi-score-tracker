/** Uma (in leaderboard points) for 1st–4th, starting with the October 2026 season. */
export const UMA_POINTS = [15, 5, -5, -15] as const;

/**
 * Uma for each seat, in leaderboard points, given final scores in seat order
 * (East first). Scored like Mahjong Soul: no oka, so net is
 * (score − starting) ÷ 1,000 + uma, and ties go to the seat closer to East.
 */
export function umaAdjustments(scoresInSeatOrder: number[]): number[] {
  const order = scoresInSeatOrder
    .map((score, seatIndex) => ({ score, seatIndex }))
    .sort((a, b) => b.score - a.score || a.seatIndex - b.seatIndex);

  const adjustments = new Array<number>(scoresInSeatOrder.length).fill(0);
  order.forEach(({ seatIndex }, place) => {
    adjustments[seatIndex] = UMA_POINTS[place] ?? 0;
  });
  return adjustments;
}
