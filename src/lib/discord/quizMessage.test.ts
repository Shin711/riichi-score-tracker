import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuestionMessage, buildRevealMessage } from "@/lib/discord/quizMessage";
import type { QuizHand } from "@/lib/quiz/hand";
import { solveHand } from "@/lib/quiz/solve";

/**
 * 234m 567m 345p 67p 55s, ron 8p under riichi — as stored before ura dora
 * existed, so with no uraDoraIndicator key at all.
 */
const STORED_HAND: QuizHand = {
  concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
  melds: [],
  winningTile: "8p",
  winType: "ron",
  seatWind: "south",
  roundWind: "east",
  doraIndicator: "4s",
  riichi: true,
};

const RIICHI_HAND: QuizHand = { ...STORED_HAND, uraDoraIndicator: "9p" };

type Message = { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };

function field(message: Message, name: string): string | undefined {
  return message.embeds[0].fields.find((f) => f.name === name)?.value;
}

describe("quiz messages — indicators", () => {
  it("names both indicators on a riichi hand", () => {
    const message = buildQuestionMessage("quiz-1", RIICHI_HAND, "2026-09-19");
    assert.equal(field(message, "Dora indicator"), "4s — 4 sou");
    assert.equal(field(message, "Ura dora indicator"), "9p — 9 pin");
  });

  it("shows no ura dora indicator without riichi", () => {
    const message = buildQuestionMessage(
      "quiz-1",
      { ...RIICHI_HAND, riichi: false },
      "2026-09-19"
    );
    assert.equal(field(message, "Dora indicator"), "4s — 4 sou");
    assert.equal(field(message, "Ura dora indicator"), undefined);
  });

  it("shows none for a riichi hand stored before ura dora existed", () => {
    const message = buildQuestionMessage("quiz-1", STORED_HAND, "2026-09-19");
    assert.equal(field(message, "Ura dora indicator"), undefined);
  });

  it("carries both indicators into the reveal, with ura dora called last", () => {
    // Ura indicator 9p is unrelated; swap in 4s so both score the pair of 5s.
    const hand = { ...RIICHI_HAND, uraDoraIndicator: "4s" };
    const message = buildRevealMessage(
      hand,
      solveHand(hand),
      { answers: 0, correct: 0 },
      "2026-09-19"
    );
    assert.equal(field(message, "Ura dora indicator"), "4s — 4 sou");
    assert.equal(
      field(message, "Yaku"),
      [
        "Pinfu — 1 han",
        "Riichi — 1 han",
        "Tanyao — 1 han",
        "Dora — 2 han",
        "Ura dora — 2 han",
      ].join("\n")
    );
  });
});
