/**
 * Discord button / modal payloads for the daily quiz.
 *
 * Kept free of tile rendering, the wasm solver, and sharp so the interactions
 * endpoint can reply within Discord's three-second window on a cold start.
 */

import {
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
} from "@/lib/discord/interactions";
import {
  gradeAnswer,
  parseScore,
  formatScoreAnswer,
  type AnswerGrade,
  type QuizAnswer,
} from "@/lib/quiz/answer";
import type { QuizHand } from "@/lib/quiz/hand";
import type { SolvedHand } from "@/lib/quiz/solve";

export const ANSWER_BUTTON_PREFIX = "quiz:answer";
export const ANSWER_MODAL_PREFIX = "quiz:modal";

export const FIELD_HAN = "han";
export const FIELD_FU = "fu";
export const FIELD_SCORE = "score";

export function answerButtonId(quizId: string): string {
  return `${ANSWER_BUTTON_PREFIX}:${quizId}`;
}

export function answerModalId(quizId: string): string {
  return `${ANSWER_MODAL_PREFIX}:${quizId}`;
}

/** Reads the quiz id back out of a button or modal custom_id. */
export function quizIdFromCustomId(customId: string): string | null {
  const match = /^quiz:(?:answer|modal):(.+)$/.exec(customId);
  return match ? match[1] : null;
}

/** The modal shown when someone clicks Answer. */
export function buildAnswerModal(quizId: string, hand: QuizHand) {
  const scorePlaceholder =
    hand.winType === "ron"
      ? "e.g. 3900"
      : hand.seatWind === "east"
        ? "e.g. 2000 all, or the total"
        : "e.g. 1300/2600, or the total";

  const textInput = (customId: string, label: string, placeholder: string) => ({
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.TextInput,
        custom_id: customId,
        label,
        style: TextInputStyle.Short,
        placeholder,
        required: true,
        max_length: 20,
      },
    ],
  });

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: answerModalId(quizId),
      title: "Score this hand",
      components: [
        textInput(FIELD_HAN, "Han", "e.g. 3"),
        textInput(FIELD_FU, "Fu", "e.g. 30"),
        textInput(FIELD_SCORE, "Score", scorePlaceholder),
      ],
    },
  };
}

const TICK = "✅";
const CROSS = "❌";

/**
 * Private confirmation after someone answers.
 *
 * Deliberately shows which parts were right without showing the right values —
 * otherwise the first answer of the day leaks the answer to whoever asks a
 * friend, and the 10pm reveal has nothing left to reveal.
 */
export function buildAnswerReceipt(answer: QuizAnswer, grade: AnswerGrade): string {
  const lines = [
    `${grade.han ? TICK : CROSS}  Han — you said **${answer.han}**`,
    grade.fuScored
      ? `${grade.fu ? TICK : CROSS}  Fu — you said **${answer.fu}**`
      : `➖  Fu — not scored, the hand is mangan on han alone`,
    `${grade.score ? TICK : CROSS}  Score — you said **${formatScoreAnswer(answer.score)}**`,
  ];

  const verdict = grade.correct
    ? "**All correct.** Nicely done."
    : "Not quite — the full breakdown goes up at 10pm ET.";

  return [`Answer recorded.`, "", ...lines, "", verdict].join("\n");
}

/** Rebuilds the receipt from the row we stored — used when Discord retries. */
export function buildStoredAnswerReceipt(
  solved: SolvedHand,
  stored: { han: number; fu: number; score_text: string }
): string | null {
  const score = parseScore(stored.score_text);
  if (score === null) return null;
  const answer = { han: stored.han, fu: stored.fu, score };
  return buildAnswerReceipt(answer, gradeAnswer(solved, answer));
}

/** Reply used when the quiz is closed, already answered, or otherwise unavailable. */
export function buildUnavailableReply(reason: string) {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: reason, flags: MessageFlags.Ephemeral },
  };
}
