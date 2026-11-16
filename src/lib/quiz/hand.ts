import { isRedFive, type Tile, type Wind } from "@/lib/quiz/tiles";

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
  /**
   * One extra indicator per kan, flipped beside the dora indicator. Absent on
   * hands without a kan (and on quizzes stored before kan dora existed).
   */
  kanDoraIndicators?: Tile[];
  /**
   * The tiles under each kan dora indicator, in the same order. Like the ura
   * dora, only turned over for a riichi winner.
   */
  kanUraDoraIndicators?: Tile[];
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

/** The face-up indicators on the wall's top row: dora, then one per kan. */
export function doraIndicators(hand: QuizHand): Tile[] {
  return [hand.doraIndicator, ...(hand.kanDoraIndicators ?? [])];
}

/**
 * The ura indicators beneath them, in the same order — empty without riichi.
 * A slot whose ura is missing (an old stored row) is simply skipped.
 */
export function uraDoraIndicators(hand: QuizHand): Tile[] {
  if (!isRiichi(hand)) return [];
  const ura = hand.uraDoraIndicator;
  return [...(ura ? [ura] : []), ...(hand.kanUraDoraIndicators ?? [])];
}

/** Every flipped indicator on the table: the dora row, then the ura row. */
export function indicatorTiles(hand: QuizHand): Tile[] {
  return [...doraIndicators(hand), ...uraDoraIndicators(hand)];
}

/** Red fives held in the hand, each worth one han of aka dora. */
export function akaCount(hand: QuizHand): number {
  return allHandTiles(hand).filter(isRedFive).length;
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
