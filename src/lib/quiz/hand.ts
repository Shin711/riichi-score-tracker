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
  riichi: boolean;
};

/** Every tile in the hand, winning tile included. */
export function allHandTiles(hand: QuizHand): Tile[] {
  return [...hand.concealed, hand.winningTile, ...hand.melds.flatMap((m) => m.tiles)];
}

export function isDealer(hand: QuizHand): boolean {
  return hand.seatWind === "east";
}
