/** Builds the Discord messages for the daily scoring quiz. */

import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  TextInputStyle,
} from "@/lib/discord/interactions";
import { describeCorrectScore, type AnswerGrade, type QuizAnswer } from "@/lib/quiz/answer";
import { formatScoreAnswer } from "@/lib/quiz/answer";
import type { Meld, QuizHand } from "@/lib/quiz/hand";
import { quizDateLabel } from "@/lib/quiz/schedule";
import type { SolvedHand } from "@/lib/quiz/solve";
import { describeTile, formatTiles, windKanji, windLabel } from "@/lib/quiz/tiles";

/** Club gold, matching the site header and the leaderboard embed. */
const EMBED_COLOR = 0xd4a24c;
const CORRECT_COLOR = 0x4c9f70;

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

const MELD_LABELS: Record<Meld["kind"], string> = {
  chi: "chi",
  pon: "pon",
  ankan: "closed kan",
  minkan: "open kan",
};

function describeMelds(melds: Meld[]): string {
  if (melds.length === 0) return "—";
  return melds.map((meld) => `${MELD_LABELS[meld.kind]} ${formatTiles(meld.tiles)}`).join("   ");
}

/**
 * The hand as a monospace block. Alignment matters here — people read the wait
 * off the shape, so the concealed tiles need to sit on their own line.
 */
function renderHand(hand: QuizHand): string {
  const rows: Array<[string, string]> = [
    ["Hand", formatTiles(hand.concealed)],
    ["Called", describeMelds(hand.melds)],
    [
      hand.winType === "ron" ? "Ron on" : "Tsumo",
      `${formatTiles([hand.winningTile])}  (${describeTile(hand.winningTile)})`,
    ],
    [
      "Dora ind.",
      `${formatTiles([hand.doraIndicator])}  (${describeTile(hand.doraIndicator)})`,
    ],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  const body = rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join("\n");
  return `\`\`\`\n${body}\n\`\`\``;
}

function renderConditions(hand: QuizHand): string {
  const bits = [
    `Round ${windKanji(hand.roundWind)}`,
    `Seat ${windKanji(hand.seatWind)} (${windLabel(hand.seatWind)})`,
    hand.seatWind === "east" ? "**Dealer**" : "Non-dealer",
    hand.winType === "ron" ? "Ron" : "Tsumo",
  ];
  if (hand.riichi) bits.push("**Riichi**");
  return bits.join(" · ");
}

export function buildQuestionMessage(quizId: string, hand: QuizHand, isoDate: string) {
  return {
    embeds: [
      {
        title: `Daily scoring quiz — ${quizDateLabel(isoDate)}`,
        description: [
          renderConditions(hand),
          renderHand(hand),
          "How much is this hand worth? Answer with **han**, **fu**, and the **score**.",
        ].join("\n"),
        color: EMBED_COLOR,
        footer: {
          text: "Answers are private · one attempt each · revealed at 10pm ET",
        },
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: "Answer",
            custom_id: answerButtonId(quizId),
          },
        ],
      },
    ],
  };
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

export type QuizRecap = {
  answers: number;
  correct: number;
};

export function buildRevealMessage(
  hand: QuizHand,
  solved: SolvedHand,
  recap: QuizRecap,
  isoDate: string
) {
  const yakuList = solved.yaku
    .map((yaku) => `${yaku.name} — ${yaku.han} han`)
    .join("\n");

  const fields = [
    { name: "Han", value: `**${solved.han}**`, inline: true },
    { name: "Fu", value: `**${solved.fu}**`, inline: true },
    { name: "Score", value: `**${describeCorrectScore(solved)}**`, inline: true },
    { name: "Yaku", value: yakuList || "—", inline: false },
  ];

  const accuracy =
    recap.answers > 0 ? Math.round((recap.correct / recap.answers) * 100) : 0;
  const recapLine =
    recap.answers === 0
      ? "Nobody answered today."
      : `**${recap.correct}** of **${recap.answers}** got it exactly right (${accuracy}%).`;

  return {
    embeds: [
      {
        title: `Answer — ${quizDateLabel(isoDate)}`,
        description: [renderConditions(hand), renderHand(hand), recapLine].join("\n"),
        color: CORRECT_COLOR,
        fields,
        footer: { text: "New hand tomorrow at 10am ET" },
      },
    ],
  };
}

/** Reply used when the quiz is closed, already answered, or otherwise unavailable. */
export function buildUnavailableReply(reason: string) {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: reason, flags: MessageFlags.Ephemeral },
  };
}
