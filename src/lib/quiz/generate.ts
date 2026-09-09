/**
 * Generates winning hands for the daily scoring quiz.
 *
 * The aim is *club-realistic* hands: the shapes people actually score at the
 * table, in the 1–5 han band where han and fu both still matter. Big hands are
 * rejected because "it's a mangan" stops being a scoring exercise.
 *
 * Strategy is build-then-check. Composing a hand that is guaranteed to have a
 * yaku is fiddly and easy to get subtly wrong; building a plausible shape and
 * asking the solver whether it qualifies is simpler and can't disagree with the
 * answer we publish, because it *is* the answer we publish.
 */

import { allHandTiles, type Meld, type QuizHand, type WinType } from "@/lib/quiz/hand";
import { chance, pick } from "@/lib/quiz/random";
import { trySolveHand, type SolvedHand } from "@/lib/quiz/solve";
import {
  allTiles,
  isTerminalOrHonor,
  makeTile,
  maxRank,
  sortTiles,
  WINDS,
  type Suit,
  type Tile,
  type Wind,
} from "@/lib/quiz/tiles";

export type GeneratorOptions = {
  /** Inclusive han band. Defaults to 1–5, i.e. up to mangan. */
  minHan?: number;
  maxHan?: number;
  /** Attempts before giving up. Generation succeeds well inside this. */
  maxAttempts?: number;
};

export type GeneratedQuiz = {
  hand: QuizHand;
  solved: SolvedHand;
  /** Attempts spent, useful for tuning the weights below. */
  attempts: number;
};

export class HandGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandGenerationError";
  }
}

const DEFAULT_MIN_HAN = 1;
const DEFAULT_MAX_HAN = 5;
const DEFAULT_MAX_ATTEMPTS = 4000;

/** Sequences dominate real hands; triplets show up but are the minority. */
const SEQUENCE_CHANCE = 0.68;
/** Honors are common as a pair or yakuhai triplet, rare as filler. */
const HONOR_SET_CHANCE = 0.16;
const HONOR_PAIR_CHANCE = 0.3;
/** Most club hands are closed. */
const CLOSED_HAND_CHANCE = 0.7;
const RIICHI_CHANCE = 0.65;
const TSUMO_CHANCE = 0.4;
/** Kans are memorable but rare; they matter most for fu practice. */
const KAN_CHANCE = 0.08;

const NUMBER_SUITS: Suit[] = ["m", "p", "s"];

/**
 * Tracks the four-copies-per-tile limit while a hand is assembled.
 *
 * This has to be enforced here: the solver scores a hand with five copies of a
 * tile without complaint, so an over-subscribed hand would sail through
 * rejection sampling and get published as an impossible puzzle.
 */
class TileSupply {
  private used = new Map<Tile, number>();

  available(tile: Tile, count = 1): boolean {
    return (this.used.get(tile) ?? 0) + count <= 4;
  }

  take(tiles: Tile[]): boolean {
    const needed = new Map<Tile, number>();
    for (const tile of tiles) needed.set(tile, (needed.get(tile) ?? 0) + 1);
    for (const [tile, count] of needed) {
      if (!this.available(tile, count)) return false;
    }
    for (const [tile, count] of needed) {
      this.used.set(tile, (this.used.get(tile) ?? 0) + count);
    }
    return true;
  }
}

/** Final gate: no tile may appear more than four times across the whole hand. */
export function hasLegalTileCounts(hand: QuizHand): boolean {
  const counts = new Map<Tile, number>();
  for (const tile of allHandTiles(hand)) {
    const next = (counts.get(tile) ?? 0) + 1;
    if (next > 4) return false;
    counts.set(tile, next);
  }
  return true;
}

type BuiltSet = {
  tiles: Tile[];
  /** A sequence can only ever be called as chi; a triplet as pon or kan. */
  kind: "sequence" | "triplet";
};

function randomSequence(random: () => number): BuiltSet {
  const suit = pick(NUMBER_SUITS, random);
  const start = 1 + Math.floor(random() * 7); // 1–7 so the run fits in the suit
  return {
    kind: "sequence",
    tiles: [makeTile(start, suit), makeTile(start + 1, suit), makeTile(start + 2, suit)],
  };
}

function randomTriplet(random: () => number): BuiltSet {
  const suit = chance(HONOR_SET_CHANCE, random) ? "z" : pick(NUMBER_SUITS, random);
  const rank = 1 + Math.floor(random() * maxRank(suit));
  const tile = makeTile(rank, suit);
  return { kind: "triplet", tiles: [tile, tile, tile] };
}

function randomSet(random: () => number): BuiltSet {
  return chance(SEQUENCE_CHANCE, random) ? randomSequence(random) : randomTriplet(random);
}

function randomPair(random: () => number): Tile {
  const suit = chance(HONOR_PAIR_CHANCE, random) ? "z" : pick(NUMBER_SUITS, random);
  return makeTile(1 + Math.floor(random() * maxRank(suit)), suit);
}

/** Builds four sets plus a pair, or gives up if the tile supply blocks it. */
function buildShape(
  random: () => number
): { sets: BuiltSet[]; pair: Tile; supply: TileSupply } | null {
  const supply = new TileSupply();
  const sets: BuiltSet[] = [];

  for (let i = 0; i < 4; i += 1) {
    let placed = false;
    for (let retry = 0; retry < 12 && !placed; retry += 1) {
      const candidate = randomSet(random);
      if (supply.take(candidate.tiles)) {
        sets.push(candidate);
        placed = true;
      }
    }
    if (!placed) return null;
  }

  for (let retry = 0; retry < 12; retry += 1) {
    const tile = randomPair(random);
    if (supply.take([tile, tile])) return { sets, pair: tile, supply };
  }
  return null;
}

/**
 * Upgrades a triplet to a kan, but only when the fourth copy is actually left
 * in the wall — the supply has to approve it, or we would build a hand holding
 * five of a tile.
 */
function tryUpgradeToKan(set: BuiltSet, supply: TileSupply): Tile[] | null {
  const fourth = set.tiles[0];
  return supply.take([fourth]) ? [...set.tiles, fourth] : null;
}

/**
 * Decides which sets are called. Sequences become chi, triplets pon or kan.
 * A kan needs a fourth copy, so it is only offered when the supply allows.
 */
function chooseMelds(
  sets: BuiltSet[],
  supply: TileSupply,
  random: () => number
): { melds: Meld[]; concealedSets: BuiltSet[] } {
  const wantsClosed = chance(CLOSED_HAND_CHANCE, random);

  // A closed hand may still hold an ankan — that is exactly the fu case worth
  // drilling, since the hand stays closed and can still be under riichi.
  if (wantsClosed) {
    const tripletIndex = sets.findIndex((set) => set.kind === "triplet");
    if (tripletIndex !== -1 && chance(KAN_CHANCE, random)) {
      const tiles = tryUpgradeToKan(sets[tripletIndex], supply);
      if (tiles) {
        return {
          melds: [{ kind: "ankan", tiles }],
          concealedSets: sets.filter((_, i) => i !== tripletIndex),
        };
      }
    }
    return { melds: [], concealedSets: sets };
  }

  const callCount = chance(0.6, random) ? 1 : 2;
  const melds: Meld[] = [];
  const concealedSets: BuiltSet[] = [];

  for (const set of sets) {
    if (melds.length < callCount) {
      if (set.kind === "sequence") {
        melds.push({ kind: "chi", tiles: set.tiles });
        continue;
      }
      const kanTiles = chance(KAN_CHANCE, random) ? tryUpgradeToKan(set, supply) : null;
      melds.push(
        kanTiles ? { kind: "minkan", tiles: kanTiles } : { kind: "pon", tiles: set.tiles }
      );
      continue;
    }
    concealedSets.push(set);
  }

  return { melds, concealedSets };
}

function buildCandidate(random: () => number): QuizHand | null {
  const shape = buildShape(random);
  if (!shape) return null;

  const { melds, concealedSets } = chooseMelds(shape.sets, shape.supply, random);

  // A kan draws a replacement tile, so a hand holding one still has 14 tiles in
  // play but 15 physical tiles. The solver accounts for this itself.
  const concealedTiles = [...concealedSets.flatMap((set) => set.tiles), shape.pair, shape.pair];

  // You cannot win on a tile locked inside a called meld, so the winning tile
  // always comes from the concealed portion.
  const winningTile = pick(concealedTiles, random);
  const concealed = [...concealedTiles];
  concealed.splice(concealed.indexOf(winningTile), 1);

  const isClosed = melds.every((meld) => meld.kind === "ankan");
  const winType: WinType = chance(TSUMO_CHANCE, random) ? "tsumo" : "ron";

  const inHand = new Set([...concealedTiles, ...melds.flatMap((m) => m.tiles)]);
  const doraIndicator = pickDoraIndicator(inHand, random);

  return {
    concealed: sortTiles(concealed),
    melds,
    winningTile,
    winType,
    seatWind: pick(WINDS, random) as Wind,
    roundWind: chance(0.75, random) ? "east" : "south",
    doraIndicator,
    riichi: isClosed && chance(RIICHI_CHANCE, random),
  };
}

/**
 * Picks a dora indicator. Mostly unrelated to the hand so dora stays a bonus
 * rather than the whole answer, but sometimes deliberately relevant.
 */
function pickDoraIndicator(inHand: Set<Tile>, random: () => number): Tile {
  const every = allTiles();
  if (chance(0.35, random)) {
    // Bias toward an indicator that actually hits, so dora counting gets practised.
    const hitting = every.filter((tile) => !isTerminalOrHonor(tile) && inHand.has(tile));
    if (hitting.length > 0) return pick(hitting, random);
  }
  return pick(every, random);
}

/**
 * Builds a hand inside the target han band. Rejects yakuman and anything the
 * solver will not score, so the published answer is always well-defined.
 */
export function generateQuizHand(
  random: () => number,
  options: GeneratorOptions = {}
): GeneratedQuiz {
  const minHan = options.minHan ?? DEFAULT_MIN_HAN;
  const maxHan = options.maxHan ?? DEFAULT_MAX_HAN;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
    const hand = buildCandidate(random);
    if (!hand) continue;

    // The solver will happily score an impossible hand, so this gate is load
    // bearing rather than defensive.
    if (!hasLegalTileCounts(hand)) continue;

    const solved = trySolveHand(hand);
    if (!solved) continue;
    if (solved.yakumanCount > 0) continue;
    if (solved.han < minHan || solved.han > maxHan) continue;

    return { hand, solved, attempts };
  }

  throw new HandGenerationError(
    `Could not generate a ${minHan}–${maxHan} han hand in ${maxAttempts} attempts.`
  );
}
