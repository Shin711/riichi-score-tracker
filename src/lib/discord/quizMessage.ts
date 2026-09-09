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
import { renderTiles, type TileEmojiMap } from "@/lib/discord/tileEmoji";
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

function describeMelds(melds: Meld[], emoji: TileEmojiMap): string {
  if (melds.length === 0) return "—";
  return melds
    .map((meld) => `${MELD_LABELS[meld.kind]} ${renderTiles(meld.tiles, emoji)}`)
    .join(" ");
}

/**
 * How the tiles are shown.
 *
 * The rendered image is the real presentation — inline emoji cap out around 22px
 * and are hard to read at a glance. Emoji remain as a fallback so a rendering
 * failure in production degrades the post rather than losing the day's quiz.
 */
export type HandVisual =
  | { kind: "image"; filename: string }
  | { kind: "emoji"; emoji: TileEmojiMap };

export const HAND_IMAGE_FILENAME = "hand.png";

type EmbedField = { name: string; value: string; inline?: boolean };

/** Fields for the emoji fallback; the image carries all of this on its own. */
function emojiHandFields(hand: QuizHand, emoji: TileEmojiMap): EmbedField[] {
  const fields: EmbedField[] = [
    { name: "Hand", value: renderTiles(hand.concealed, emoji), inline: false },
  ];

  if (hand.melds.length > 0) {
    fields.push({ name: "Called", value: describeMelds(hand.melds, emoji), inline: false });
  }

  fields.push({
    name: hand.winType === "ron" ? "Ron on" : "Tsumo",
    value: `${renderTiles([hand.winningTile], emoji)} ${describeTile(hand.winningTile)}`,
    inline: true,
  });

  return fields;
}

function handFields(hand: QuizHand, visual: HandVisual): EmbedField[] {
  const fields =
    visual.kind === "emoji" ? emojiHandFields(hand, visual.emoji) : ([] as EmbedField[]);

  // The image already draws meld type using table convention, but fu and
  // whether the hand is closed both hinge on reading it right, so it is spelled
  // out too rather than resting on the reader knowing the convention.
  if (visual.kind === "image" && hand.melds.length > 0) {
    fields.push({
      name: "Called",
      value: hand.melds
        .map((meld) => `${MELD_LABELS[meld.kind]} ${formatTiles(meld.tiles)}`)
        .join("\n"),
      inline: true,
    });
  }

  // Named explicitly either way: the image shows the indicator as the flipped
  // tile in the wall, which is obvious to a regular but not to a newer player.
  fields.push({
    name: "Dora indicator",
    value: `${formatTiles([hand.doraIndicator])} — ${describeTile(hand.doraIndicator)}`,
    inline: true,
  });

  return fields;
}

function handImage(visual: HandVisual) {
  return visual.kind === "image"
    ? { image: { url: `attachment://${visual.filename}` } }
    : {};
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

export function buildQuestionMessage(
  quizId: string,
  hand: QuizHand,
  isoDate: string,
  visual: HandVisual = { kind: "emoji", emoji: null }
) {
  return {
    embeds: [
      {
        title: `Daily scoring quiz — ${quizDateLabel(isoDate)}`,
        description: [
          renderConditions(hand),
          "",
          "How much is this hand worth? Answer with **han**, **fu**, and the **score**.",
        ].join("\n"),
        color: EMBED_COLOR,
        ...handImage(visual),
        fields: handFields(hand, visual),
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
  isoDate: string,
  visual: HandVisual = { kind: "emoji", emoji: null }
) {
  const yakuList = solved.yaku
    .map((yaku) => `${yaku.name} — ${yaku.han} han`)
    .join("\n");

  const accuracy =
    recap.answers > 0 ? Math.round((recap.correct / recap.answers) * 100) : 0;
  const recapLine =
    recap.answers === 0
      ? "Nobody answered today."
      : `**${recap.correct}** of **${recap.answers}** got it exactly right (${accuracy}%).`;

  const fields = [
    ...handFields(hand, visual),
    { name: "Han", value: `**${solved.han}**`, inline: true },
    { name: "Fu", value: `**${solved.fu}**`, inline: true },
    { name: "Score", value: `**${describeCorrectScore(solved)}**`, inline: true },
    { name: "Yaku", value: yakuList || "—", inline: false },
  ];

  return {
    embeds: [
      {
        title: `Answer — ${quizDateLabel(isoDate)}`,
        description: [renderConditions(hand), "", recapLine].join("\n"),
        color: CORRECT_COLOR,
        ...handImage(visual),
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
