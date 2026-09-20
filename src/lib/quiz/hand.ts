import type { Tile, Wind } from "@/lib/quiz/tiles";

export type MeldKind = "chi" | "pon" | "ankan" | "minkan";

export type Meld = {
  kind: MeldKind;
  /** Three tiles for chi/pon, four for either kan. */
  tiles: Tile[];
};

export function isOpenMeld(meld: Meld): boolean {
  // An ankan sits in front of the player but keeps the hand closed.
  return meld.kind !== "ankan";
}

export function isClosedHand(melds: Meld[]): boolean {
  return melds.every((meld) => !isOpenMeld(meld));
}

export type WinType = "ron" | "tsumo";

/**
 * A complete winning hand plus the table conditions needed to score it.
 *
 * `concealed` never includes the winning tile — it is carried separately so
 * ron and tsumo can be fed to the solver in the different shapes it expects.
 */
export type QuizHand = {
  concealed: Tile[];
  melds: Meld[];
  winningTile: Tile;
  winType: WinType;
  seatWind: Wind;
  roundWind: Wind;
  doraIndicator: Tile;
  /**
   * The tile under the dora indicator, turned over only for a riichi winner.
   *
   * Absent rather than `null` when there is none: hands are stored as JSON, and
   * quizzes posted before ura dora existed have no such key, so "missing" has to
   * mean "no ura dora" either way. Read it through {@link uraDoraIndicator}.
   */
  uraDoraIndicator?: Tile;
  riichi: boolean;
};

/** Every tile in the hand, winning tile included. */
export function allHandTiles(hand: QuizHand): Tile[] {
  return [...hand.concealed, hand.winningTile, ...hand.melds.flatMap((m) => m.tiles)];
}

/** Riichi needs a closed hand, so the flag is ignored on an open one. */
export function isRiichi(hand: QuizHand): boolean {
  return hand.riichi && isClosedHand(hand.melds);
}

/**
 * The ura dora indicator if it is in play, else `null`.
 *
 * Scoring and display both go through here so they cannot disagree about
 * whether a hand gets ura dora — it never does without riichi.
 */
export function uraDoraIndicator(hand: QuizHand): Tile | null {
  return isRiichi(hand) ? (hand.uraDoraIndicator ?? null) : null;
}

/** The flipped indicators on the table: the dora, then the ura dora if any. */
export function indicatorTiles(hand: QuizHand): Tile[] {
  const ura = uraDoraIndicator(hand);
  return ura ? [hand.doraIndicator, ura] : [hand.doraIndicator];
}

/**
 * Every physical tile the puzzle shows. Indicators come out of the same 136
 * tiles as the hand, so they count toward the four-copies limit too.
 */
export function allShownTiles(hand: QuizHand): Tile[] {
  return [...allHandTiles(hand), ...indicatorTiles(hand)];
}

export function isDealer(hand: QuizHand): boolean {
  return hand.seatWind === "east";
}
