/**
 * Winning hands stored on an imported game, in `entries_json` seat order.
 * Kept free of the Mahjong Soul client so the Discord command can read it.
 */

export type StoredHandResult = {
  winnerSeat: number;
  /** Null when the hand was a tsumo. */
  dealInSeat: number | null;
  /** Hand value, the same number the game log shows for a biggest hand. */
  points: number;
};

export type WinningHandLike = {
  seat: number;
  points: number;
  tsumo: boolean;
  dealInSeat: number | null;
};

function isSeat(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 4;
}

/**
 * Hands worth storing. A ron with no discarder is dropped rather than recorded
 * as a tsumo. Returns null when `stats` never carried a hand list (a preview
 * token issued before hands were kept), so the row stays "unknown".
 */
export function storedHandResults(
  stats: { winningHands?: WinningHandLike[] } | null
): StoredHandResult[] | null {
  if (!stats || !Array.isArray(stats.winningHands)) return null;
  return handResultsFromWinningHands(stats.winningHands);
}

export function handResultsFromWinningHands(hands: WinningHandLike[]): StoredHandResult[] {
  const results: StoredHandResult[] = [];
  for (const hand of hands) {
    if (!isSeat(hand.seat) || !Number.isFinite(hand.points) || hand.points < 0) continue;
    const points = Math.round(hand.points);
    if (hand.tsumo) {
      results.push({ winnerSeat: hand.seat, dealInSeat: null, points });
      continue;
    }
    if (!isSeat(hand.dealInSeat) || hand.dealInSeat === hand.seat) continue;
    results.push({ winnerSeat: hand.seat, dealInSeat: hand.dealInSeat, points });
  }
  return results;
}

/** Parsed hands, or null when the column is missing or not a hand list. */
export function parseHandResults(value: unknown): StoredHandResult[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;

  const hands: StoredHandResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (!isSeat(row.winnerSeat)) return null;
    if (typeof row.points !== "number" || !Number.isInteger(row.points) || row.points < 0) {
      return null;
    }
    if (row.dealInSeat === null) {
      hands.push({ winnerSeat: row.winnerSeat, dealInSeat: null, points: row.points });
      continue;
    }
    if (!isSeat(row.dealInSeat) || row.dealInSeat === row.winnerSeat) return null;
    hands.push({ winnerSeat: row.winnerSeat, dealInSeat: row.dealInSeat, points: row.points });
  }
  return hands;
}
