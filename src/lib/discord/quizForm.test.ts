import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InteractionResponseType,
  MessageFlags,
} from "@/lib/discord/interactions";
import {
  answerButtonId,
  answerModalId,
  buildAlreadyAnsweredReply,
  buildAnswerModal,
  buildAnswerReceipt,
  buildUnavailableReply,
  quizIdFromCustomId,
} from "@/lib/discord/quizForm";
import type { AnswerGrade } from "@/lib/quiz/answer";
import type { QuizHand } from "@/lib/quiz/hand";
import type { SolvedHand } from "@/lib/quiz/solve";

const HAND: QuizHand = {
  concealed: ["2m", "3m", "4m"],
  melds: [],
  winningTile: "5m",
  winType: "ron",
  seatWind: "south",
  roundWind: "east",
  doraIndicator: "1s",
  riichi: true,
};

describe("quizForm", () => {
  it("round-trips the quiz id through button and modal custom ids", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    assert.equal(quizIdFromCustomId(answerButtonId(id)), id);
    assert.equal(quizIdFromCustomId(answerModalId(id)), id);
  });

  it("opens a modal (Discord's initial response — it cannot be deferred)", () => {
    const modal = buildAnswerModal("quiz-1", HAND);
    assert.equal(modal.type, InteractionResponseType.Modal);
    assert.equal(modal.data.custom_id, answerModalId("quiz-1"));
    assert.equal(modal.data.components.length, 3);
  });

  it("uses an ephemeral message when the quiz is unavailable", () => {
    const reply = buildUnavailableReply("closed");
    assert.equal(reply.type, InteractionResponseType.ChannelMessageWithSource);
    assert.equal(reply.data.flags, MessageFlags.Ephemeral);
  });
});

describe("answer receipt", () => {
  /** Riichi + pinfu + tanyao + 1 ura dora, non-dealer ron: 4 han 30 fu, 7700. */
  const RON: SolvedHand = {
    han: 4,
    fu: 30,
    ten: 7700,
    tsumoPayment: null,
    yaku: [
      { name: "Pinfu", han: 1 },
      { name: "Riichi", han: 1 },
      { name: "Tanyao", han: 1 },
      { name: "Ura dora", han: 1 },
    ],
    yakumanCount: 0,
    isDealer: false,
  };

  const grade = (overrides: Partial<AnswerGrade> = {}): AnswerGrade => ({
    han: true,
    fu: true,
    score: true,
    fuScored: true,
    correct: true,
    ...overrides,
  });

  const ANSWER = { han: 4, fu: 30, score: { kind: "total", value: 7700 } } as const;

  it("gives the answer to someone who got it right", () => {
    const receipt = buildAnswerReceipt(ANSWER, grade(), RON);
    assert.match(receipt, /All correct/);
    assert.match(receipt, /Correct answer: 4 han 30 fu · 7700/);
  });

  it("gives the same answer to someone who got it wrong", () => {
    const wrong = { han: 3, fu: 40, score: { kind: "total", value: 5200 } } as const;
    const receipt = buildAnswerReceipt(
      wrong,
      grade({ han: false, fu: false, score: false, correct: false }),
      RON
    );
    assert.match(receipt, /Not quite/);
    assert.match(receipt, /❌ {2}Han — you said \*\*3\*\*/);
    assert.match(receipt, /Correct answer: 4 han 30 fu · 7700/);
  });

  it("lists every yaku, so the han can be traced", () => {
    const receipt = buildAnswerReceipt(ANSWER, grade(), RON);
    for (const yaku of RON.yaku) {
      assert.ok(receipt.includes(`- ${yaku.name} — ${yaku.han} han`), `missing ${yaku.name}`);
    }
  });

  it("writes a tsumo answer as the split, not just the total", () => {
    const tsumo: SolvedHand = {
      ...RON,
      ten: 12000,
      han: 5,
      fu: 40,
      isDealer: true,
      tsumoPayment: { kind: "all", each: 4000 },
    };
    const receipt = buildAnswerReceipt(ANSWER, grade({ fuScored: false }), tsumo);
    assert.match(receipt, /Correct answer: 5 han 40 fu · 4000 all \(12000 total\)/);
    assert.match(receipt, /Fu — not scored/);
  });

  it("asks them not to pass it on before the public reveal", () => {
    assert.match(buildAnswerReceipt(ANSWER, grade(), RON), /keep it to yourself/);
  });

  it("stays inside Discord's 2000 character message limit", () => {
    // Far more yaku than the 1–5 han band can produce, with the longest names.
    const crowded: SolvedHand = {
      ...RON,
      yaku: Array.from({ length: 13 }, () => ({ name: "Kokushimusou (13 sides)", han: 1 })),
    };
    assert.ok(buildAnswerReceipt(ANSWER, grade(), crowded).length < 2000);
  });

  it("shows the answer again on a second submission", () => {
    const reply = buildAlreadyAnsweredReply(RON);
    assert.match(reply, /already answered/);
    assert.match(reply, /only your first answer counts/);
    assert.match(reply, /Correct answer: 4 han 30 fu · 7700/);
  });
});
