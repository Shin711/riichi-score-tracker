/**
 * Parses and grades the han / fu / score answers people type into the quiz modal.
 *
 * Input is deliberately forgiving: players write scores several equally correct
 * ways ("3900", "3,900", "1300/2600", "2000 all") and the bot should not mark
 * someone wrong for notation.
 */

import type { SolvedHand } from "@/lib/quiz/solve";

export type ScoreAnswer =
  | { kind: "total"; value: number }
  | { kind: "split"; parts: number[] };

export type QuizAnswer = {
  han: number;
  fu: number;
  score: ScoreAnswer;
};

export type AnswerGrade = {
  han: boolean;
  fu: boolean;
  score: boolean;
  /** Fu is not graded once the hand is mangan on han alone — it cannot matter. */
  fuScored: boolean;
  correct: boolean;
};

/** Mangan by han alone; below this, fu still changes the payment. */
const MANGAN_HAN = 5;

function digitsOnly(raw: string): string {
  return raw.replace(/[,\s_]/g, "");
}

/** Accepts "3", "3 han", "3han", "３" (full width). */
export function parseCount(raw: string): number | null {
  const normalized = digitsOnly(raw.normalize("NFKC")).toLowerCase();
  const match = /^(\d{1,3})(han|fu|h|f)?$/.exec(normalized);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Accepts a single total ("3900", "3,900") or a tsumo split ("1300/2600",
 * "500-1000", "2000 all"). Split parts keep their written order.
 */
export function parseScore(raw: string): ScoreAnswer | null {
  const normalized = digitsOnly(raw.normalize("NFKC")).toLowerCase().replace(/pts?|points?/g, "");
  if (normalized.length === 0) return null;

  // "2000all" — dealer tsumo shorthand, every opponent pays the same.
  const all = /^(\d{2,6})all$/.exec(normalized);
  if (all) return { kind: "split", parts: [Number(all[1])] };

  const split = normalized.split(/[/\-–—]/).filter((part) => part.length > 0);
  if (split.length > 1) {
    const parts = split.map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return { kind: "split", parts };
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? { kind: "total", value } : null;
}

/**
 * Every score notation we accept for a hand.
 *
 * Ron has one form. Tsumo has three: the total the winner gains, the
 * conventional "ko/oya" split, and — for a dealer, where everyone pays alike —
 * the single "all" figure.
 */
function acceptableScores(solved: SolvedHand): {
  totals: number[];
  splits: number[][];
} {
  const totals = [solved.ten];
  const splits: number[][] = [];

  const payment = solved.tsumoPayment;
  if (payment?.kind === "all") {
    // Dealer tsumo: one figure, written "2000 all" or just "2000".
    splits.push([payment.each]);
    totals.push(payment.each);
  } else if (payment?.kind === "split") {
    splits.push([payment.fromNonDealer, payment.fromDealer]);
    // Written the other way round is the same claim, so accept it too.
    splits.push([payment.fromDealer, payment.fromNonDealer]);
  }

  return { totals, splits };
}

function sameParts(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function gradeScore(solved: SolvedHand, answer: ScoreAnswer): boolean {
  const { totals, splits } = acceptableScores(solved);

  if (answer.kind === "total") {
    return totals.includes(answer.value);
  }
  // A one-part "split" is the dealer-tsumo "all" form; it can also be a total.
  if (answer.parts.length === 1 && totals.includes(answer.parts[0])) return true;
  return splits.some((split) => sameParts(split, answer.parts));
}

export function gradeAnswer(solved: SolvedHand, answer: QuizAnswer): AnswerGrade {
  const fuScored = solved.han < MANGAN_HAN;

  const han = answer.han === solved.han;
  const fu = answer.fu === solved.fu;
  const score = gradeScore(solved, answer.score);

  return {
    han,
    fu,
    score,
    fuScored,
    correct: han && score && (!fuScored || fu),
  };
}

export function formatScoreAnswer(answer: ScoreAnswer): string {
  return answer.kind === "total" ? String(answer.value) : answer.parts.join("/");
}

/** How the correct score should be written back in the reveal. */
export function describeCorrectScore(solved: SolvedHand): string {
  const payment = solved.tsumoPayment;
  if (!payment) return `${solved.ten}`;
  return payment.kind === "all"
    ? `${payment.each} all (${solved.ten} total)`
    : `${payment.fromNonDealer}/${payment.fromDealer} (${solved.ten} total)`;
}
