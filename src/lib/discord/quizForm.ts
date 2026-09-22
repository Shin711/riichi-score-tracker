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
  type AnswerMode,
  type QuizAnswer,
} from "@/lib/quiz/answer";
import { beginnerChoices } from "@/lib/quiz/beginner";
import type { QuizHand } from "@/lib/quiz/hand";
// Type only, and it has to stay that way: a value import would pull the wasm
// solver into the interactions route and blow its three-second reply budget.
import type { SolvedHand } from "@/lib/quiz/solve";

export const ANSWER_BUTTON_PREFIX = "quiz:answer";
export const ANSWER_MODAL_PREFIX = "quiz:modal";
export const BEGINNER_BUTTON_PREFIX = "quiz:beginner";
export const BEGINNER_MODAL_PREFIX = "quiz:beginner-modal";

export const FIELD_HAN = "han";
export const FIELD_FU = "fu";
export const FIELD_SCORE = "score";

export function answerButtonId(quizId: string): string {
  return `${ANSWER_BUTTON_PREFIX}:${quizId}`;
}

export function answerModalId(quizId: string): string {
  return `${ANSWER_MODAL_PREFIX}:${quizId}`;
}

export function beginnerButtonId(quizId: string): string {
  return `${BEGINNER_BUTTON_PREFIX}:${quizId}`;
}

export function beginnerModalId(quizId: string): string {
  return `${BEGINNER_MODAL_PREFIX}:${quizId}`;
}

export type QuizControl = {
  kind: "answer" | "modal" | "beginner" | "beginner-modal";
  quizId: string;
};

/** Reads which control was used, and for which quiz, out of a custom_id. */
export function parseCustomId(customId: string): QuizControl | null {
  const match = /^quiz:(answer|modal|beginner|beginner-modal):(.+)$/.exec(customId);
  return match ? { kind: match[1] as QuizControl["kind"], quizId: match[2] } : null;
}

/** Reads the quiz id back out of a button or modal custom_id. */
export function quizIdFromCustomId(customId: string): string | null {
  return parseCustomId(customId)?.quizId ?? null;
}

const HAN_QUESTION = "How many han is the hand worth?";
const FU_QUESTION = "How many fu?";

function scoreQuestion(hand: QuizHand): string {
  if (hand.winType === "ron") return "What does the discarder pay?";
  return hand.seatWind === "east"
    ? "What does each of the other three pay?"
    : "What do the others pay? Written non-dealer / dealer.";
}

/**
 * The typed form behind Answer: one free-text field per question.
 *
 * Each field sits inside a Label component, which is where Discord now wants
 * a modal field's caption; the older action-row layout still works but is
 * no longer recommended.
 */
export function buildAnswerModal(quizId: string, hand: QuizHand) {
  const scorePlaceholder =
    hand.winType === "ron"
      ? "e.g. 3900"
      : hand.seatWind === "east"
        ? "e.g. 2000 all, or the total"
        : "e.g. 1300/2600, or the total";

  const textInput = (
    customId: string,
    label: string,
    description: string,
    placeholder: string
  ) => ({
    type: ComponentType.Label,
    label,
    description,
    component: {
      type: ComponentType.TextInput,
      custom_id: customId,
      style: TextInputStyle.Short,
      placeholder,
      required: true,
      max_length: 20,
    },
  });

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: answerModalId(quizId),
      title: "Score this hand",
      components: [
        textInput(FIELD_HAN, "Han", HAN_QUESTION, "e.g. 3"),
        textInput(FIELD_FU, "Fu", FU_QUESTION, "e.g. 30"),
        textInput(FIELD_SCORE, "Score", scoreQuestion(hand), scorePlaceholder),
      ],
    },
  };
}

/** Fu values that only ever come from one kind of hand, said so on the option. */
const FU_NOTES: Record<number, string> = {
  20: "Only a closed pinfu won by tsumo",
  25: "Only seven pairs",
};

type SelectOption = { label: string; value: string; description?: string };

/**
 * The multiple-choice form behind the Beginner button.
 *
 * The options come from `beginnerChoices`, seeded by the quiz id so that
 * reopening the form shows the same list. `solved` is the answer stored when
 * the hand was posted — never re-solved here, which would load the solver.
 */
export function buildBeginnerModal(quizId: string, hand: QuizHand, solved: SolvedHand) {
  const choices = beginnerChoices(hand, solved, `beginner:${quizId}`);

  const select = (customId: string, placeholder: string, options: SelectOption[]) => ({
    type: ComponentType.StringSelect,
    custom_id: customId,
    placeholder,
    options,
    required: true,
  });
  const labelled = (label: string, description: string, component: ReturnType<typeof select>) => ({
    type: ComponentType.Label,
    label,
    description,
    component,
  });
  const note = (description: string | null | undefined) =>
    description ? { description } : {};

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: beginnerModalId(quizId),
      title: "Score this hand — beginner",
      components: [
        {
          type: ComponentType.TextDisplay,
          content:
            "Pick one answer for each. This is your one attempt for today, the same as the regular form.",
        },
        labelled(
          "Han",
          HAN_QUESTION,
          select(
            FIELD_HAN,
            "Choose the han",
            choices.han.map((han) => ({ label: `${han} han`, value: `${han}` }))
          )
        ),
        labelled(
          "Fu",
          FU_QUESTION,
          select(
            FIELD_FU,
            "Choose the fu",
            choices.fu.map((fu) => ({ label: `${fu} fu`, value: `${fu}`, ...note(FU_NOTES[fu]) }))
          )
        ),
        labelled(
          "Score",
          scoreQuestion(hand),
          select(
            FIELD_SCORE,
            "Choose the score",
            choices.scores.map((score) => ({
              label: score.value,
              value: score.value,
              ...note(score.detail),
            }))
          )
        ),
      ],
    },
  };
}

const TICK = "✅";
const CROSS = "❌";

/**
 * The correct answer with its yaku and fu, as shown privately to someone who
 * has answered. Right or wrong gets the same thing: the point of the quiz is
 * to learn the hand, and a bare cross teaches nothing until the evening.
 *
 * Only ever built for someone whose answer is already stored. Attempts are one
 * per person, so seeing this cannot help them — the remaining risk is a member
 * passing it on, which the closing line asks them not to do.
 */
function describeAnswer(solved: SolvedHand): string {
  const fuLines = solved.fuBreakdown ?? [];
  return [
    `**Correct answer: ${solved.han} han ${solved.fu} fu · ${describeCorrectScore(solved)}**`,
    "__Han__",
    ...solved.yaku.map((yaku) => `- ${yaku.name} — ${yaku.han} han`),
    // Older answers were stored without the fu lines; they just get none.
    ...(fuLines.length > 0
      ? ["__Fu__", ...fuLines.map((line) => `- ${line.name} — ${line.fu} fu`)]
      : []),
    "",
    "_Please keep it to yourself — the hand is revealed for everyone at 10pm ET._",
  ].join("\n");
}

/** Private confirmation after someone answers: how they did, then the answer. */
export function buildAnswerReceipt(
  answer: QuizAnswer,
  grade: AnswerGrade,
  solved: SolvedHand,
  mode: AnswerMode = "typed"
): string {
  const lines = [
    `${grade.han ? TICK : CROSS}  Han — you said **${answer.han}**`,
    grade.fuScored
      ? `${grade.fu ? TICK : CROSS}  Fu — you said **${answer.fu}**`
      : `➖  Fu — not scored, the hand is mangan on han alone`,
    `${grade.score ? TICK : CROSS}  Score — you said **${formatScoreAnswer(answer.score)}**`,
  ];

  const recorded = mode === "beginner" ? "Answer recorded (beginner form)." : "Answer recorded.";
  const verdict = grade.correct ? "**All correct.** Nicely done." : "Not quite.";

  return [recorded, "", ...lines, "", verdict, "", describeAnswer(solved)].join("\n");
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
