import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ButtonStyle } from "@/lib/discord/interactions";
import {
  answerButtonId,
  beginnerButtonId,
  buildQuestionMessage,
  buildRevealMessage,
  type QuizRecap,
} from "@/lib/discord/quizMessage";
import type { QuizHand } from "@/lib/quiz/hand";
import { solveHand } from "@/lib/quiz/solve";

const NO_ANSWERS: QuizRecap = { answers: 0, correct: 0, beginner: { answers: 0, correct: 0 } };

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

describe("quiz messages — recap", () => {
  const recap = (counts: QuizRecap) =>
    buildRevealMessage(RIICHI_HAND, solveHand(RIICHI_HAND), counts, "2026-09-19").embeds[0]
      .description;

  it("says when nobody answered", () => {
    assert.match(recap(NO_ANSWERS), /Nobody answered today\./);
  });

  it("gives one line when every answer was typed", () => {
    const line = recap({ answers: 7, correct: 3, beginner: { answers: 0, correct: 0 } });
    assert.match(line, /\*\*3\*\* of \*\*7\*\* got it exactly right \(43%\)\./);
    assert.doesNotMatch(line, /beginner/i);
  });

  it("reports the beginner form on its own when both forms were used", () => {
    const line = recap({ answers: 7, correct: 3, beginner: { answers: 2, correct: 1 } });
    assert.match(line, /\*\*3\*\* of \*\*7\*\* got it exactly right \(43%\)\./);
    assert.match(line, /Typed: \*\*2\*\* of \*\*5\*\* · Beginner form: \*\*1\*\* of \*\*2\*\*\./);
  });

  it("says so when every answer used the beginner form", () => {
    const line = recap({ answers: 2, correct: 1, beginner: { answers: 2, correct: 1 } });
    assert.match(line, /\*\*1\*\* of \*\*2\*\* got it exactly right \(50%\)\. All of them used the beginner form\./);
  });
});

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

  it("offers the regular form and the beginner form side by side", () => {
    const message = buildQuestionMessage("quiz-1", RIICHI_HAND, "2026-09-19");
    const buttons = message.components[0].components;
    assert.deepEqual(
      buttons.map((button) => [button.label, button.custom_id, button.style]),
      [
        ["Answer", answerButtonId("quiz-1"), ButtonStyle.Primary],
        ["Beginner", beginnerButtonId("quiz-1"), ButtonStyle.Secondary],
      ]
    );
    assert.match(message.embeds[0].description, /Beginner/);
  });

  it("itemises the fu in the reveal, after the yaku", () => {
    const message = buildRevealMessage(RIICHI_HAND, solveHand(RIICHI_HAND), NO_ANSWERS, "2026-09-19");
    assert.equal(
      field(message, "Fu breakdown"),
      [
        "Base — 20 fu",
        "Closed hand, won by ron — 10 fu",
        "Ryanmen wait, 8 pin completing 678p — 0 fu",
      ].join("\n")
    );
    const names = message.embeds[0].fields.map((f) => f.name);
    assert.ok(names.indexOf("Yaku") < names.indexOf("Fu breakdown"));
  });

  it("leaves the fu breakdown out of the reveal for an answer stored without one", () => {
    const stored = { ...solveHand(RIICHI_HAND) };
    delete stored.fuBreakdown;
    const message = buildRevealMessage(RIICHI_HAND, stored, NO_ANSWERS, "2026-09-19");
    assert.equal(field(message, "Fu breakdown"), undefined);
  });

  it("carries both indicators into the reveal, with ura dora called last", () => {
    // Ura indicator 9p is unrelated; swap in 4s so both score the pair of 5s.
    const hand = { ...RIICHI_HAND, uraDoraIndicator: "4s" };
    const message = buildRevealMessage(hand, solveHand(hand), NO_ANSWERS, "2026-09-19");
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
