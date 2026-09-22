/**
 * Multiple-choice answers for the beginner form.
 *
 * Han is offered as the whole 1–5 band the quiz draws from. Fu and score are
 * offered as a short run of neighbouring values that contains the answer, so
 * every wrong option is something the hand could plausibly be worth: a 1 han
 * hand is never offered a mangan, and a hand with no kan is never offered
 * 110 fu.
 *
 * Where the run sits around the answer is drawn from a generator seeded by
 * the quiz id, so the answer has no fixed place in the list and every press
 * of the button shows the same options — opening the form twice must not
 * reveal anything the first opening did not.
 *
 * Pure arithmetic on purpose: this runs inside the Discord interactions
 * endpoint, which cannot afford to load the wasm solver.
 */

import { gradeScore, parseScore } from "@/lib/quiz/answer";
import { possibleFu } from "@/lib/quiz/fu";
import type { QuizHand, WinType } from "@/lib/quiz/hand";
import { createRandom, hashSeed } from "@/lib/quiz/random";
import type { SolvedHand, TsumoPayment } from "@/lib/quiz/solve";

export type ScoreChoice = {
  /** In a notation the answer parser accepts, so it is graded exactly as typed. */
  value: string;
  /** Tsumo only: the total, so the split can be checked against it. */
  detail: string | null;
  total: number;
};

export type BeginnerChoices = { han: number[]; fu: number[]; scores: ScoreChoice[] };

/** Options per question. Between three and six reads as a quiz, not a list. */
export const CHOICE_COUNT = 5;

const HAN_BAND = [1, 2, 3, 4, 5];
const FU_LADDER = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

const roundUp100 = (points: number) => Math.ceil(points / 100) * 100;

/** Base points before the ron/tsumo multipliers, capped at mangan. */
export function basePoints(han: number, fu: number): number {
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  return Math.min(2000, fu * 2 ** (han + 2));
}

export type Score = { ten: number; tsumoPayment: TsumoPayment | null };

/** Standard payment for a han/fu pair, no honba. Matches the solver's table. */
export function scoreFor(han: number, fu: number, isDealer: boolean, winType: WinType): Score {
  const base = basePoints(han, fu);
  if (winType === "ron") {
    return { ten: roundUp100(base * (isDealer ? 6 : 4)), tsumoPayment: null };
  }
  if (isDealer) {
    const each = roundUp100(base * 2);
    return { ten: each * 3, tsumoPayment: { kind: "all", each } };
  }
  const fromDealer = roundUp100(base * 2);
  const fromNonDealer = roundUp100(base);
  return {
    ten: fromDealer + fromNonDealer * 2,
    tsumoPayment: { kind: "split", fromDealer, fromNonDealer },
  };
}

/** The notation the reveal uses, minus the bracketed total. */
export function scoreChoice(score: Score): ScoreChoice {
  const payment = score.tsumoPayment;
  if (!payment) return { value: `${score.ten}`, detail: null, total: score.ten };
  if (payment.kind === "all") {
    return { value: `${payment.each} all`, detail: `${score.ten} total`, total: score.ten };
  }
  return {
    value: `${payment.fromNonDealer} / ${payment.fromDealer}`,
    detail: `${score.ten} total`,
    total: score.ten,
  };
}

/**
 * A run of `size` consecutive items that covers `from..to` (the answer at
 * least), placed at random within whatever room the list leaves.
 */
function runCovering<T>(
  items: T[],
  from: number,
  to: number,
  size: number,
  random: () => number
): T[] {
  if (items.length <= size) return items;
  const earliest = Math.max(0, to - size + 1);
  const latest = Math.min(from, items.length - size);
  const start = earliest + Math.floor(random() * (latest - earliest + 1));
  return items.slice(start, start + size);
}

function hanChoices(solved: SolvedHand): number[] {
  return [...new Set([...HAN_BAND, solved.han])].sort((a, b) => a - b);
}

/**
 * Fu the hand could be read as, padded out with the neighbouring steps. 20
 * and 25 only appear when this hand really can be a pinfu tsumo or seven
 * pairs — for any other hand they are not wrong answers but impossible ones,
 * and offering them teaches the wrong lesson.
 */
function fuChoices(hand: QuizHand, solved: SolvedHand, random: () => number): number[] {
  const readable = possibleFu(hand);
  const ladder = [
    ...new Set([...FU_LADDER.filter((fu) => fu >= 30), ...readable, solved.fu]),
  ].sort((a, b) => a - b);

  const correct = ladder.indexOf(solved.fu);
  const lowest = ladder.indexOf(readable[0] ?? solved.fu);
  const highest = ladder.indexOf(readable[readable.length - 1] ?? solved.fu);
  const from = Math.min(correct, lowest);
  const to = Math.max(correct, highest);

  // Cover every reading when the run is wide enough, else just the answer.
  return to - from + 1 <= CHOICE_COUNT
    ? runCovering(ladder, from, to, CHOICE_COUNT, random)
    : runCovering(ladder, correct, correct, CHOICE_COUNT, random);
}

/**
 * Scores reachable from the offered han and fu, with the answer among them.
 * Neighbours on the payment table are what a near miss on han or fu would
 * have produced, which is exactly the kind of wrong answer worth offering.
 */
function scoreChoices(
  hand: QuizHand,
  solved: SolvedHand,
  han: number[],
  fu: number[],
  random: () => number
): ScoreChoice[] {
  // The answer comes from the solver's own figures, never from our table, so
  // it is always offered even if the table ever disagreed with the solver.
  const correct = scoreChoice({ ten: solved.ten, tsumoPayment: solved.tsumoPayment });
  const byValue = new Map<string, ScoreChoice>([[correct.value, correct]]);
  for (const h of han) {
    for (const f of fu) {
      const choice = scoreChoice(scoreFor(h, f, solved.isDealer, hand.winType));
      if (!byValue.has(choice.value)) byValue.set(choice.value, choice);
    }
  }

  // The typed-answer grader is lenient on purpose — "6000 all" passes for a
  // 2000-all hand because 6000 is the total — so any wrong option it would
  // pass is dropped. There must be exactly one right answer to pick.
  const wouldPass = (choice: ScoreChoice) => {
    const parsed = parseScore(choice.value);
    return parsed !== null && gradeScore(solved, parsed);
  };
  const table = [...byValue.values()]
    .filter((choice) => choice.value === correct.value || !wouldPass(choice))
    .sort((a, b) => a.total - b.total || a.value.localeCompare(b.value));
  const index = table.findIndex((choice) => choice.value === correct.value);
  return runCovering(table, index, index, CHOICE_COUNT, random);
}

/** `seed` must be fixed per quiz — see the module comment. */
export function beginnerChoices(hand: QuizHand, solved: SolvedHand, seed: string): BeginnerChoices {
  const random = createRandom(hashSeed(seed));
  const han = hanChoices(solved);
  const fu = fuChoices(hand, solved, random);
  return { han, fu, scores: scoreChoices(hand, solved, han, fu, random) };
}
