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
  describeCorrectScore,
  formatScoreAnswer,
  type AnswerGrade,
  type QuizAnswer,
} from "@/lib/quiz/answer";
import type { QuizHand } from "@/lib/quiz/hand";
// Type only, and it has to stay that way: a value import would pull the wasm
// solver into the interactions route and blow its three-second reply budget.
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
 * The correct answer with its yaku, as shown privately to someone who has
 * answered. Right or wrong gets the same thing: the point of the quiz is to
 * learn the hand, and a bare cross teaches nothing until the evening.
 *
 * Only ever built for someone whose answer is already stored. Attempts are one
 * per person, so seeing this cannot help them — the remaining risk is a member
 * passing it on, which the closing line asks them not to do.
 */
function describeAnswer(solved: SolvedHand): string {
  return [
    `**Correct answer: ${solved.han} han ${solved.fu} fu · ${describeCorrectScore(solved)}**`,
    ...solved.yaku.map((yaku) => `- ${yaku.name} — ${yaku.han} han`),
    "",
    "_Please keep it to yourself — the hand is revealed for everyone at 10pm ET._",
  ].join("\n");
}

/** Private confirmation after someone answers: how they did, then the answer. */
export function buildAnswerReceipt(
  answer: QuizAnswer,
  grade: AnswerGrade,
  solved: SolvedHand
): string {
  const lines = [
    `${grade.han ? TICK : CROSS}  Han — you said **${answer.han}**`,
    grade.fuScored
      ? `${grade.fu ? TICK : CROSS}  Fu — you said **${answer.fu}**`
      : `➖  Fu — not scored, the hand is mangan on han alone`,
    `${grade.score ? TICK : CROSS}  Score — you said **${formatScoreAnswer(answer.score)}**`,
  ];

  const verdict = grade.correct ? "**All correct.** Nicely done." : "Not quite.";

  return [`Answer recorded.`, "", ...lines, "", verdict, "", describeAnswer(solved)].join("\n");
}

/**
 * Reply to a second submission. Their first answer stands, but they have
 * already been shown the answer once, so there is nothing to hold back — and the
 * original receipt is ephemeral, so this is how they get it back.
 */
export function buildAlreadyAnsweredReply(solved: SolvedHand): string {
  return [
    "You have already answered today's hand — only your first answer counts.",
    "",
    describeAnswer(solved),
  ].join("\n");
}

/** Reply used when the quiz is closed, already answered, or otherwise unavailable. */
export function buildUnavailableReply(reason: string) {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: reason, flags: MessageFlags.Ephemeral },
  };
}
