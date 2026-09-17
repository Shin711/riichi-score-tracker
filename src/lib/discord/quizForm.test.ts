import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InteractionResponseType,
  MessageFlags,
} from "@/lib/discord/interactions";
import {
  answerButtonId,
  answerModalId,
  buildAnswerModal,
  buildStoredAnswerReceipt,
  buildUnavailableReply,
  quizIdFromCustomId,
} from "@/lib/discord/quizForm";
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

  it("rebuilds the original receipt when Discord retries a counted submit", () => {
    const solved: SolvedHand = {
      han: 3,
      fu: 30,
      ten: 3900,
      tsumoPayment: null,
      yaku: [{ name: "Riichi", han: 1 }],
      yakumanCount: 0,
      isDealer: false,
    };
    const receipt = buildStoredAnswerReceipt(solved, {
      han: 3,
      fu: 30,
      score_text: "3900",
    });
    assert.ok(receipt);
    assert.match(receipt, /Answer recorded/);
    assert.match(receipt, /All correct/);
  });
});
