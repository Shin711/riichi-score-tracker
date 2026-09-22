/**
 * Where a hand's fu comes from, itemised the way a scorer would say it aloud.
 *
 * The solver reports fu as a single number. To explain it, the hand is read
 * back into blocks — sets, pair, and the wait the winning tile filled — and
 * each block is priced from the standard table. A hand can often be read more
 * than one way (a 4m win on 234m + 44m is a ryanmen wait or a tanki wait), and
 * the readings can differ in fu. The solver keeps whichever reading scores
 * best, so the reading shown is the one whose total matches the solver's fu
 * *and* whose shape agrees with the yaku the solver found. If no reading
 * satisfies both, there is no honest explanation and none is given.
 *
 * Deliberately free of `riichi-rs-node`: the Discord interactions endpoint
 * needs this within its three-second budget, and loading the wasm solver there
 * is what once made the first click of the day fail.
 */

import { isClosedHand, type Meld, type QuizHand } from "@/lib/quiz/hand";
import {
  describeTile,
  formatTiles,
  fromSolverTile,
  isTerminalOrHonor,
  toSolverTile,
  windTile,
} from "@/lib/quiz/tiles";

/** One source of fu, mirroring the `{ name, han }` entries for yaku. */
export type FuLine = { name: string; fu: number };

/**
 * Display names of the yaku whose presence depends on how the hand is read.
 * The solver's name table uses these same constants, so the two cannot drift.
 */
export const SHAPE_YAKU = {
  pinfu: "Pinfu",
  iipeikou: "Iipeikou",
  ryanpeikou: "Ryanpeikou",
  toitoi: "Toitoi",
  sanankou: "Sanankou",
  chiitoitsu: "Chiitoitsu",
  sanshoku: "Sanshoku",
  sanshokuDoukou: "Sanshoku doukou",
  ittsuu: "Ittsuu",
  chanta: "Chanta",
  junchan: "Junchan",
} as const;

/** Solver ids, 1–34. Red fives fold into fives, which is all fu cares about. */
type Id = number;

const HONOR_START = 28;
const DRAGON_START = 32;

function rankOf(id: Id): number {
  return ((id - 1) % 9) + 1;
}

/** 0–2 for man, pin, sou; 3 for honors. */
function suitOf(id: Id): number {
  return Math.floor((id - 1) / 9);
}

function isNumberTile(id: Id): boolean {
  return id < HONOR_START;
}

function isOuter(id: Id): boolean {
  return isTerminalOrHonor(fromSolverTile(id));
}

function tileName(id: Id): string {
  return describeTile(fromSolverTile(id));
}

function sequenceNotation(low: Id): string {
  return formatTiles([low, low + 1, low + 2].map(fromSolverTile));
}

function tripletNotation(id: Id): string {
  return formatTiles([id, id, id].map(fromSolverTile));
}

type Block =
  | { kind: "sequence"; low: Id; open: boolean }
  | { kind: "triplet"; tile: Id; open: boolean; ronCompleted: boolean }
  | { kind: "kan"; tile: Id; open: boolean };

function meldBlock(meld: Meld): Block {
  const ids = meld.tiles.map(toSolverTile);
  switch (meld.kind) {
    case "chi":
      return { kind: "sequence", low: Math.min(...ids), open: true };
    case "pon":
      return { kind: "triplet", tile: ids[0], open: true, ronCompleted: false };
    case "minkan":
      return { kind: "kan", tile: ids[0], open: true };
    case "ankan":
      return { kind: "kan", tile: ids[0], open: false };
  }
}

/**
 * Triplet 2, kan 8; doubled when concealed, doubled again for a terminal or
 * honor. Sequences are worth nothing.
 */
function blockFu(block: Block): number {
  if (block.kind === "sequence") return 0;
  let fu = block.kind === "kan" ? 8 : 2;
  if (!block.open) fu *= 2;
  if (isOuter(block.tile)) fu *= 2;
  return fu;
}

function blockName(block: Block): string {
  if (block.kind === "sequence") return sequenceNotation(block.low);
  if (block.kind === "triplet" && block.ronCompleted) {
    return `Triplet of ${tileName(block.tile)}, completed by ron so counted as open`;
  }
  const state = block.open ? "Open" : "Closed";
  return `${state} ${block.kind} of ${tileName(block.tile)}`;
}

type WaitKind = "ryanmen" | "shanpon" | "kanchan" | "penchan" | "tanki";

type Wait = { kind: WaitKind; won: Id; block: string };

const WAIT_FU: Record<WaitKind, number> = {
  ryanmen: 0,
  shanpon: 0,
  kanchan: 2,
  penchan: 2,
  tanki: 2,
};

function waitName(wait: Wait): string {
  const label = wait.kind.charAt(0).toUpperCase() + wait.kind.slice(1);
  return `${label} wait, ${tileName(wait.won)} completing ${wait.block}`;
}

type ConcealedSet = { kind: "sequence" | "triplet"; tile: Id };

/** The wait a winning tile filled in a concealed set it belongs to. */
function waitIn(set: ConcealedSet, won: Id): Wait {
  if (set.kind === "triplet") {
    return { kind: "shanpon", won, block: tripletNotation(set.tile) };
  }
  const block = sequenceNotation(set.tile);
  const offset = won - set.tile;
  if (offset === 1) return { kind: "kanchan", won, block };
  // 12 waiting on 3, or 89 waiting on 7: the one-sided edge wait.
  const edge =
    (offset === 2 && rankOf(set.tile) === 1) || (offset === 0 && rankOf(set.tile) === 7);
  return { kind: edge ? "penchan" : "ryanmen", won, block };
}

/** Dragons and the winner's own winds make the pair worth fu. */
function pairFu(pair: Id, hand: QuizHand): { fu: number; reason: string } | null {
  if (pair >= DRAGON_START) return { fu: 2, reason: "dragon" };
  const seat = toSolverTile(windTile(hand.seatWind));
  const round = toSolverTile(windTile(hand.roundWind));
  if (pair === seat && pair === round) return { fu: 4, reason: "seat and round wind" };
  if (pair === seat) return { fu: 2, reason: "seat wind" };
  if (pair === round) return { fu: 2, reason: "round wind" };
  return null;
}

/** Everything about a reading that decides which yaku the solver could find. */
export type ReadingShape = {
  pinfu: boolean;
  /** Pairs of identical concealed sequences: 1 is iipeikou, 2 is ryanpeikou. */
  peikou: number;
  allTriplets: boolean;
  closedTriplets: number;
  sevenPairs: boolean;
  sanshoku: boolean;
  sanshokuDoukou: boolean;
  ittsuu: boolean;
  chanta: boolean;
  junchan: boolean;
};

export type FuReading = {
  fu: number;
  /** Adds up to `fu` exactly, rounding included. */
  lines: FuLine[];
  shape: ReadingShape;
};

function countIds(ids: Id[]): number[] {
  const counts = new Array<number>(35).fill(0);
  for (const id of ids) if (id >= 1 && id <= 34) counts[id] += 1;
  return counts;
}

/**
 * Every way to split the concealed tiles into `setsNeeded` sets and a pair.
 *
 * Always takes the lowest remaining tile first, as either a triplet or the
 * start of a sequence. Because the set that holds the lowest tile differs
 * between the two branches, no split is produced twice.
 */
function decompose(
  counts: number[],
  setsNeeded: number
): Array<{ pair: Id; sets: ConcealedSet[] }> {
  const results: Array<{ pair: Id; sets: ConcealedSet[] }> = [];
  for (let pair = 1; pair <= 34; pair += 1) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    for (const sets of decomposeSets(counts, setsNeeded)) results.push({ pair, sets });
    counts[pair] += 2;
  }
  return results;
}

function decomposeSets(counts: number[], remaining: number): ConcealedSet[][] {
  const lowest = counts.findIndex((count, id) => id > 0 && count > 0);
  if (remaining === 0) return lowest === -1 ? [[]] : [];
  if (lowest === -1) return [];

  const splits: ConcealedSet[][] = [];
  if (counts[lowest] >= 3) {
    counts[lowest] -= 3;
    for (const rest of decomposeSets(counts, remaining - 1)) {
      splits.push([{ kind: "triplet", tile: lowest }, ...rest]);
    }
    counts[lowest] += 3;
  }
  const runFits = isNumberTile(lowest) && rankOf(lowest) <= 7;
  if (runFits && counts[lowest + 1] > 0 && counts[lowest + 2] > 0) {
    counts[lowest] -= 1;
    counts[lowest + 1] -= 1;
    counts[lowest + 2] -= 1;
    for (const rest of decomposeSets(counts, remaining - 1)) {
      splits.push([{ kind: "sequence", tile: lowest }, ...rest]);
    }
    counts[lowest] += 1;
    counts[lowest + 1] += 1;
    counts[lowest + 2] += 1;
  }
  return splits;
}

/** Seven different pairs; four of a kind does not count as two of them. */
function isSevenPairs(counts: number[]): boolean {
  return (
    counts.filter((count) => count === 2).length === 7 &&
    counts.every((count) => count === 0 || count === 2)
  );
}

function setContains(set: ConcealedSet, id: Id): boolean {
  return set.kind === "triplet" ? set.tile === id : id >= set.tile && id <= set.tile + 2;
}

function sevenPairsReading(): FuReading {
  return {
    fu: 25,
    lines: [{ name: "Seven pairs, always 25", fu: 25 }],
    shape: {
      pinfu: false,
      peikou: 0,
      allTriplets: false,
      closedTriplets: 0,
      sevenPairs: true,
      sanshoku: false,
      sanshokuDoukou: false,
      ittsuu: false,
      chanta: false,
      junchan: false,
    },
  };
}

function shapeOf(blocks: Block[], pair: Id, closedHand: boolean, pinfu: boolean): ReadingShape {
  const sequences = blocks.flatMap((block) => (block.kind === "sequence" ? [block] : []));
  const triplets = blocks.flatMap((block) => (block.kind === "sequence" ? [] : [block]));
  const numberSuits = [0, 1, 2];

  // Identical sequences only score as iipeikou / ryanpeikou in a closed hand.
  let peikou = 0;
  if (closedHand) {
    const copies = new Map<Id, number>();
    for (const seq of sequences) copies.set(seq.low, (copies.get(seq.low) ?? 0) + 1);
    for (const count of copies.values()) peikou += Math.floor(count / 2);
  }

  const hasSequence = (suit: number, rank: number) =>
    sequences.some((seq) => suitOf(seq.low) === suit && rankOf(seq.low) === rank);
  const hasTriplet = (suit: number, rank: number) =>
    triplets.some((set) => suitOf(set.tile) === suit && rankOf(set.tile) === rank);

  const sanshoku = [1, 2, 3, 4, 5, 6, 7].some((rank) =>
    numberSuits.every((suit) => hasSequence(suit, rank))
  );
  const sanshokuDoukou = [1, 2, 3, 4, 5, 6, 7, 8, 9].some((rank) =>
    numberSuits.every((suit) => hasTriplet(suit, rank))
  );
  const ittsuu = numberSuits.some((suit) =>
    [1, 4, 7].every((rank) => hasSequence(suit, rank))
  );

  // Chanta and junchan need a terminal or honor in every block, and at least
  // one sequence — without one the hand is honroutou instead.
  const outer =
    isOuter(pair) &&
    blocks.every((block) =>
      block.kind === "sequence"
        ? rankOf(block.low) === 1 || rankOf(block.low) === 7
        : isOuter(block.tile)
    );
  const hasHonor = pair >= HONOR_START || triplets.some((set) => set.tile >= HONOR_START);
  const mixed = outer && sequences.length > 0;

  return {
    pinfu,
    peikou,
    allTriplets: sequences.length === 0,
    closedTriplets: triplets.filter((set) => !set.open).length,
    sevenPairs: false,
    sanshoku,
    sanshokuDoukou,
    ittsuu,
    chanta: mixed && hasHonor,
    junchan: mixed && !hasHonor,
  };
}

type Placement = { where: "pair" } | { where: number };

function priceReading(
  hand: QuizHand,
  pair: Id,
  sets: ConcealedSet[],
  melds: Block[],
  placement: Placement
): FuReading {
  const won = toSolverTile(hand.winningTile);
  const ron = hand.winType === "ron";
  const closedHand = isClosedHand(hand.melds);

  const concealed: Block[] = sets.map((set, index) => {
    if (set.kind === "sequence") return { kind: "sequence", low: set.tile, open: false };
    // A triplet finished by the discard was never concealed as a set, so it
    // scores as an open one. On tsumo the whole triplet stays concealed.
    const ronCompleted = ron && placement.where === index;
    return { kind: "triplet", tile: set.tile, open: ronCompleted, ronCompleted };
  });
  const blocks = [...concealed, ...melds];

  const wait: Wait =
    placement.where === "pair"
      ? { kind: "tanki", won, block: "the pair" }
      : waitIn(sets[placement.where], won);

  const pairBonus = pairFu(pair, hand);
  const pinfu =
    hand.melds.length === 0 &&
    concealed.every((block) => block.kind === "sequence") &&
    wait.kind === "ryanmen" &&
    pairBonus === null;

  const lines: FuLine[] = [{ name: "Base", fu: 20 }];
  if (closedHand && ron) lines.push({ name: "Closed hand, won by ron", fu: 10 });
  if (!ron) {
    lines.push(pinfu ? { name: "Tsumo, waived for pinfu", fu: 0 } : { name: "Tsumo", fu: 2 });
  }
  for (const block of blocks) {
    const fu = blockFu(block);
    if (fu > 0) lines.push({ name: blockName(block), fu });
  }
  if (pairBonus) {
    lines.push({ name: `Pair of ${tileName(pair)}, ${pairBonus.reason}`, fu: pairBonus.fu });
  }
  lines.push({ name: waitName(wait), fu: WAIT_FU[wait.kind] });

  const raw = lines.reduce((sum, line) => sum + line.fu, 0);
  let fu: number;
  if (raw === 20 && !closedHand && ron) {
    // An open hand with nothing but the base is still paid as 30.
    fu = 30;
    lines.push({ name: "Open hand with no other fu counts as 30", fu: 10 });
  } else {
    fu = Math.ceil(raw / 10) * 10;
    if (fu !== raw) lines.push({ name: `Rounded up from ${raw} to ${fu}`, fu: fu - raw });
  }

  return { fu, lines, shape: shapeOf(blocks, pair, closedHand, pinfu) };
}

/**
 * Every legal reading of the hand, each priced. The solver's fu is always one
 * of them; the others are the near-misses a scorer might plausibly land on.
 */
export function fuReadings(hand: QuizHand): FuReading[] {
  const won = toSolverTile(hand.winningTile);
  const counts = countIds([...hand.concealed, hand.winningTile].map(toSolverTile));
  const melds = hand.melds.map(meldBlock);
  const readings: FuReading[] = [];

  if (hand.melds.length === 0 && isSevenPairs(counts)) readings.push(sevenPairsReading());

  for (const { pair, sets } of decompose(counts, 4 - hand.melds.length)) {
    // Two identical sets give the same reading whichever one the winning tile
    // is put in, so each distinct set is only tried once.
    const tried = new Set<string>();
    const consider = (placement: Placement, key: string) => {
      if (tried.has(key)) return;
      tried.add(key);
      readings.push(priceReading(hand, pair, sets, melds, placement));
    };

    if (pair === won) consider({ where: "pair" }, "pair");
    sets.forEach((set, index) => {
      if (setContains(set, won)) consider({ where: index }, `${set.kind}:${set.tile}`);
    });
  }

  return readings;
}

/** Distinct fu values the hand can be read as, ascending. */
export function possibleFu(hand: QuizHand): number[] {
  return [...new Set(fuReadings(hand).map((reading) => reading.fu))].sort((a, b) => a - b);
}

type YakuList = Array<{ name: string }>;

/** Whether a reading could have produced exactly the shape-dependent yaku listed. */
function agreesWithYaku(shape: ReadingShape, yaku: YakuList): boolean {
  const has = (name: string) => yaku.some((entry) => entry.name === name);
  return (
    has(SHAPE_YAKU.pinfu) === shape.pinfu &&
    has(SHAPE_YAKU.iipeikou) === (shape.peikou === 1) &&
    has(SHAPE_YAKU.ryanpeikou) === (shape.peikou === 2) &&
    has(SHAPE_YAKU.toitoi) === shape.allTriplets &&
    has(SHAPE_YAKU.sanankou) === (shape.closedTriplets === 3) &&
    has(SHAPE_YAKU.chiitoitsu) === shape.sevenPairs &&
    has(SHAPE_YAKU.sanshoku) === shape.sanshoku &&
    has(SHAPE_YAKU.sanshokuDoukou) === shape.sanshokuDoukou &&
    has(SHAPE_YAKU.ittsuu) === shape.ittsuu &&
    has(SHAPE_YAKU.chanta) === shape.chanta &&
    has(SHAPE_YAKU.junchan) === shape.junchan
  );
}

/**
 * The fu lines for the reading the solver scored, or `null` when no reading
 * reproduces its fu alongside its yaku. Callers show nothing in that case
 * rather than an explanation that does not add up to the published number.
 */
export function explainFu(
  hand: QuizHand,
  solved: { fu: number; yaku: YakuList }
): FuLine[] | null {
  const match = fuReadings(hand).find(
    (reading) => reading.fu === solved.fu && agreesWithYaku(reading.shape, solved.yaku)
  );
  return match ? match.lines : null;
}

/**
 * Fills in the fu lines for an answer stored before they existed. Newer rows
 * carry them from post time; older ones are explained on the spot, and left
 * alone if that fails.
 */
export function withFuBreakdown<
  T extends { fu: number; yaku: YakuList; fuBreakdown?: FuLine[] },
>(hand: QuizHand, solved: T): T {
  if (solved.fuBreakdown) return solved;
  const fuBreakdown = explainFu(hand, solved);
  return fuBreakdown ? { ...solved, fuBreakdown } : solved;
}
