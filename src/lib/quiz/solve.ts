/**
 * Scores a quiz hand with `riichi-rs-node` (wasm build of riichi-rust).
 *
 * We deliberately do not use the older `riichi-ts`: it is deprecated by its
 * author and ships known scoring errors, which is disqualifying for a bot that
 * grades people in public.
 */

import { calc, Yaku as SolverYaku, type RiichiInput } from "riichi-rs-node";

import {
  allHandTiles,
  indicatorTiles,
  isDealer,
  isRiichi,
  uraDoraIndicator,
  type Meld,
  type QuizHand,
} from "@/lib/quiz/hand";
import { doraFromIndicator, toSolverTile, windTile, type Tile } from "@/lib/quiz/tiles";

/**
 * The solver types tiles as the literal union 1–34 but does not export the type
 * itself, so we recover it from the input shape. `toSolverTile` is exhaustively
 * tested to land in that range, which is what makes the assertions below sound.
 */
type SolverTile = RiichiInput["closed_part"][number];
type SolverMeld = RiichiInput["open_part"][number];

function asSolverTile(tile: Tile): SolverTile {
  return toSolverTile(tile) as SolverTile;
}

/**
 * Tsumo payments. A dealer collects the same amount from all three opponents;
 * a non-dealer collects a larger share from the dealer.
 */
export type TsumoPayment =
  | { kind: "all"; each: number }
  | { kind: "split"; fromDealer: number; fromNonDealer: number };

export type SolvedHand = {
  han: number;
  fu: number;
  /** Total points the winner gains, honba excluded. */
  ten: number;
  /** Tsumo only: what each seat hands over. */
  tsumoPayment: TsumoPayment | null;
  yaku: Array<{ name: string; han: number }>;
  yakumanCount: number;
  isDealer: boolean;
};

export class UnscorableHandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnscorableHandError";
  }
}

/** Solver yaku id → display name. Ids come from `riichi-rs-node`'s `Yaku` map. */
const YAKU_NAMES: Record<number, string> = {
  [SolverYaku.Kokushimusou13Sides]: "Kokushimusou (13 sides)",
  [SolverYaku.Kokushimusou]: "Kokushimusou",
  [SolverYaku.Chuurenpoto9Sides]: "Chuurenpoutou (9 sides)",
  [SolverYaku.Chuurenpoto]: "Chuurenpoutou",
  [SolverYaku.SuuankouTanki]: "Suuankou tanki",
  [SolverYaku.Suuankou]: "Suuankou",
  [SolverYaku.Daisuushi]: "Daisuushii",
  [SolverYaku.Shosuushi]: "Shousuushii",
  [SolverYaku.Daisangen]: "Daisangen",
  [SolverYaku.Tsuuiisou]: "Tsuuiisou",
  [SolverYaku.Ryuuiisou]: "Ryuuiisou",
  [SolverYaku.Chinroutou]: "Chinroutou",
  [SolverYaku.Suukantsu]: "Suukantsu",
  [SolverYaku.Tenhou]: "Tenhou",
  [SolverYaku.Chihou]: "Chiihou",
  [SolverYaku.Renhou]: "Renhou",
  [SolverYaku.Daisharin]: "Daisharin",
  [SolverYaku.Chinitsu]: "Chinitsu",
  [SolverYaku.Honitsu]: "Honitsu",
  [SolverYaku.Ryanpeikou]: "Ryanpeikou",
  [SolverYaku.Junchan]: "Junchan",
  [SolverYaku.Chanta]: "Chanta",
  [SolverYaku.Toitoi]: "Toitoi",
  [SolverYaku.Honroutou]: "Honroutou",
  [SolverYaku.Sankantsu]: "Sankantsu",
  [SolverYaku.Shosangen]: "Shousangen",
  [SolverYaku.SanshokuDoukou]: "Sanshoku doukou",
  [SolverYaku.Sanankou]: "Sanankou",
  [SolverYaku.Chiitoitsu]: "Chiitoitsu",
  [SolverYaku.DaburuRiichi]: "Daburu riichi",
  [SolverYaku.Ittsu]: "Ittsuu",
  [SolverYaku.Sanshoku]: "Sanshoku",
  [SolverYaku.Tanyao]: "Tanyao",
  [SolverYaku.Pinfu]: "Pinfu",
  [SolverYaku.Iipeikou]: "Iipeikou",
  [SolverYaku.Menzentsumo]: "Menzen tsumo",
  [SolverYaku.Riichi]: "Riichi",
  [SolverYaku.Ippatsu]: "Ippatsu",
  [SolverYaku.Rinshan]: "Rinshan kaihou",
  [SolverYaku.Chankan]: "Chankan",
  [SolverYaku.Haitei]: "Haitei raoyue",
  [SolverYaku.Houtei]: "Houtei raoyui",
  [SolverYaku.RoundWindEast]: "Round wind (East)",
  [SolverYaku.RoundWindSouth]: "Round wind (South)",
  [SolverYaku.RoundWindWest]: "Round wind (West)",
  [SolverYaku.RoundWindNorth]: "Round wind (North)",
  [SolverYaku.OwnWindEast]: "Seat wind (East)",
  [SolverYaku.OwnWindSouth]: "Seat wind (South)",
  [SolverYaku.OwnWindWest]: "Seat wind (West)",
  [SolverYaku.OwnWindNorth]: "Seat wind (North)",
  [SolverYaku.Haku]: "Haku",
  [SolverYaku.Hatsu]: "Hatsu",
  [SolverYaku.Chun]: "Chun",
  [SolverYaku.Dora]: "Dora",
  [SolverYaku.Uradora]: "Ura dora",
  [SolverYaku.Akadora]: "Aka dora",
};

function meldToSolver(meld: Meld): SolverMeld {
  // The solver's meld tuple is [isOpen, tiles]; only a kan may be closed, so a
  // three-tile meld is always open.
  const tiles = meld.tiles.map(asSolverTile);
  return tiles.length === 4
    ? [meld.kind !== "ankan", [tiles[0], tiles[1], tiles[2], tiles[3]]]
    : [true, [tiles[0], tiles[1], tiles[2]]];
}

/**
 * All dora tiles a single indicator yields. Kept as an array so extra
 * indicators (kan dora) can be added later without changing callers.
 */
function doraTiles(indicators: Tile[]): SolverTile[] {
  return indicators.map((indicator) => asSolverTile(doraFromIndicator(indicator)));
}

/** How many han one indicator is worth: one per matching tile in the hand. */
function countDora(hand: QuizHand, indicator: Tile): number {
  // Compared as solver ids so a red five still counts as the five it is.
  const dora = toSolverTile(doraFromIndicator(indicator));
  return allHandTiles(hand).filter((tile) => toSolverTile(tile) === dora).length;
}

type YakuEntry = { name: string; han: number };

/**
 * Splits the solver's single dora figure into dora and ura dora.
 *
 * The solver has one `dora` input and no ura dora input at all — its `Uradora`
 * yaku id is never emitted — so both kinds go in together and come back as one
 * lump. People score them as separate lines, and the reveal should read the way
 * they would say it, so the lump is divided back up here by counting tiles.
 *
 * The two counts have to add back up to what the solver reported. If they ever
 * do not, our idea of dora has drifted from the solver's and the han we publish
 * could not be trusted, so this refuses to score the hand rather than guess.
 */
function splitDora(hand: QuizHand, solverDoraHan: number): YakuEntry[] {
  const ura = uraDoraIndicator(hand);
  const doraHan = countDora(hand, hand.doraIndicator);
  const uraHan = ura ? countDora(hand, ura) : 0;

  if (doraHan + uraHan !== solverDoraHan) {
    throw new Error(
      `Dora count mismatch: solver says ${solverDoraHan}, we count ${doraHan} + ${uraHan} ura.`
    );
  }

  const entries: YakuEntry[] = [];
  if (doraHan > 0) entries.push({ name: YAKU_NAMES[SolverYaku.Dora], han: doraHan });
  if (uraHan > 0) entries.push({ name: YAKU_NAMES[SolverYaku.Uradora], han: uraHan });
  return entries;
}

export function solveHand(hand: QuizHand): SolvedHand {
  // Ron wants 13 concealed tiles with the winning tile named separately; tsumo
  // wants it appended to the concealed part. Getting this backwards makes the
  // solver reject the hand outright ("Incorrect number of tiles").
  const closedPart =
    hand.winType === "tsumo"
      ? [...hand.concealed, hand.winningTile]
      : [...hand.concealed];

  const result = calc({
    closed_part: closedPart.map(asSolverTile),
    open_part: hand.melds.map(meldToSolver),
    options: {
      bakaze: asSolverTile(windTile(hand.roundWind)),
      jikaze: asSolverTile(windTile(hand.seatWind)),
      riichi: isRiichi(hand),
      // Dora and ura dora together: the solver counts each entry separately, so
      // two indicators pointing at the same tile correctly score it twice.
      dora: doraTiles(indicatorTiles(hand)),
      tile_discarded_by_someone:
        hand.winType === "ron" ? asSolverTile(hand.winningTile) : -1,
    },
  });

  if (!result.is_agari) {
    throw new UnscorableHandError("Hand is not a winning hand.");
  }
  if (result.han === 0) {
    throw new UnscorableHandError("Hand has no yaku.");
  }

  const solverYaku = Object.entries(result.yaku).map(([id, han]) => ({
    id: Number(id),
    han: Number(han),
  }));
  const solverDoraHan = solverYaku.find((entry) => entry.id === SolverYaku.Dora)?.han ?? 0;

  // Yaku first, biggest first; then dora and ura dora, the order they are called
  // at the table.
  const yaku = [
    ...solverYaku
      .filter((entry) => entry.id !== SolverYaku.Dora)
      .map((entry) => ({ name: YAKU_NAMES[entry.id] ?? `Yaku ${entry.id}`, han: entry.han }))
      .sort((a, b) => b.han - a.han || a.name.localeCompare(b.name)),
    ...splitDora(hand, solverDoraHan),
  ];

  return {
    han: result.han,
    fu: result.fu,
    ten: result.ten,
    tsumoPayment:
      hand.winType === "tsumo" && result.outgoing_ten
        ? readTsumoPayment(result.outgoing_ten, isDealer(hand))
        : null,
    yaku,
    yakumanCount: result.yakuman,
    isDealer: isDealer(hand),
  };
}

/**
 * `outgoing_ten` is always `[what a dealer pays, what a non-dealer pays]`,
 * derived from the base points and *independent of who won*. When the dealer is
 * the winner there is no dealer left to pay, so all three opponents hand over
 * the first figure and the second is meaningless — reading it as the per-player
 * amount would understate a dealer tsumo badly.
 */
function readTsumoPayment(outgoing: [number, number], winnerIsDealer: boolean): TsumoPayment {
  const [dealerPays, nonDealerPays] = outgoing;
  return winnerIsDealer
    ? { kind: "all", each: dealerPays }
    : { kind: "split", fromDealer: dealerPays, fromNonDealer: nonDealerPays };
}

/** `solveHand` that reports failure instead of throwing, for generator loops. */
export function trySolveHand(hand: QuizHand): SolvedHand | null {
  try {
    return solveHand(hand);
  } catch {
    return null;
  }
}
