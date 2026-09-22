import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gradeScore, parseCount, parseScore } from "@/lib/quiz/answer";
import { beginnerChoices, CHOICE_COUNT, scoreChoice, scoreFor } from "@/lib/quiz/beginner";
import { generateQuizHand } from "@/lib/quiz/generate";
import type { QuizHand } from "@/lib/quiz/hand";
import { createRandom } from "@/lib/quiz/random";
import { solveHand, type SolvedHand } from "@/lib/quiz/solve";

/** 234m 567m 345p 67p 55s, ron 8p under riichi: 3 han 30 fu, 3900. */
const PINFU: QuizHand = {
  concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
  melds: [],
  winningTile: "8p",
  winType: "ron",
  seatWind: "south",
  roundWind: "east",
  doraIndicator: "1z",
  riichi: true,
};

/** chi 234m, 567m 345p 67p 55s, ron 8p: open tanyao, 1 han 30 fu, 1000. */
const OPEN_TANYAO: QuizHand = {
  ...PINFU,
  concealed: ["5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
  melds: [{ kind: "chi", tiles: ["2m", "3m", "4m"] }],
  riichi: false,
};

const SAMPLE = 500;

function sample(seed = 9001) {
  const random = createRandom(seed);
  return Array.from({ length: SAMPLE }, () => generateQuizHand(random));
}

function choicesFor(hand: QuizHand, seed = "quiz-1"): [SolvedHand, ReturnType<typeof beginnerChoices>] {
  const solved = solveHand(hand);
  return [solved, beginnerChoices(hand, solved, seed)];
}

describe("scoreFor", () => {
  it("matches the standard table", () => {
    assert.equal(scoreFor(3, 30, false, "ron").ten, 3900);
    assert.equal(scoreFor(1, 30, false, "ron").ten, 1000);
    // No kiriage: 4 han 30 fu stays at 7700.
    assert.equal(scoreFor(4, 30, false, "ron").ten, 7700);
    assert.equal(scoreFor(4, 40, false, "ron").ten, 8000);
    assert.equal(scoreFor(5, 20, true, "ron").ten, 12000);
    assert.deepEqual(scoreFor(2, 30, true, "tsumo"), {
      ten: 3000,
      tsumoPayment: { kind: "all", each: 1000 },
    });
    assert.deepEqual(scoreFor(4, 20, false, "tsumo"), {
      ten: 5200,
      tsumoPayment: { kind: "split", fromDealer: 2600, fromNonDealer: 1300 },
    });
  });

  it("agrees with the solver on every generated hand", () => {
    for (const { hand, solved } of sample()) {
      assert.deepEqual(
        scoreFor(solved.han, solved.fu, solved.isDealer, hand.winType),
        { ten: solved.ten, tsumoPayment: solved.tsumoPayment },
        `${solved.han} han ${solved.fu} fu ${hand.winType} dealer=${solved.isDealer}`
      );
    }
  });
});

describe("beginnerChoices — shape", () => {
  const hands = sample();

  it("offers between three and six options per question", () => {
    for (const { hand, solved } of hands) {
      const choices = beginnerChoices(hand, solved, "quiz-1");
      for (const list of [choices.han, choices.fu, choices.scores]) {
        assert.ok(list.length >= 3 && list.length <= 6, `${list.length} options`);
      }
    }
  });

  it("lists every question in ascending order", () => {
    for (const { hand, solved } of hands) {
      const choices = beginnerChoices(hand, solved, "quiz-1");
      const ascending = (values: number[]) => values.every((v, i) => i === 0 || v > values[i - 1]);
      assert.ok(ascending(choices.han));
      assert.ok(ascending(choices.fu));
      assert.ok(ascending(choices.scores.map((score) => score.total)));
    }
  });

  it("always includes the right answer", () => {
    for (const { hand, solved } of hands) {
      const choices = beginnerChoices(hand, solved, "quiz-1");
      const correct = scoreChoice({ ten: solved.ten, tsumoPayment: solved.tsumoPayment });
      assert.ok(choices.han.includes(solved.han));
      assert.ok(choices.fu.includes(solved.fu));
      assert.ok(choices.scores.some((score) => score.value === correct.value));
    }
  });

  it("grades exactly one score option as correct", () => {
    // The values go through the same parser as typed answers, so a wrong
    // option must never be lenient enough to pass.
    for (const { hand, solved } of hands) {
      const choices = beginnerChoices(hand, solved, "quiz-1");
      const right = choices.scores.filter((score) => {
        const parsed = parseScore(score.value);
        assert.ok(parsed, `unparseable option ${score.value}`);
        return gradeScore(solved, parsed);
      });
      assert.equal(right.length, 1, choices.scores.map((s) => s.value).join(" | "));
      for (const fu of choices.fu) assert.equal(parseCount(`${fu}`), fu);
    }
  });

  it("offers the same options every time the form is opened", () => {
    for (const { hand, solved } of hands.slice(0, 50)) {
      assert.deepEqual(
        beginnerChoices(hand, solved, "quiz-1"),
        beginnerChoices(hand, solved, "quiz-1")
      );
    }
  });

  it("does not park the right answer in a fixed slot", () => {
    // Over many quizzes the answer must move around the list, or the position
    // itself becomes the tell.
    const [solved] = choicesFor(PINFU);
    const positions = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      const choices = beginnerChoices(PINFU, solved, `quiz-${i}`);
      positions.add(choices.scores.findIndex((score) => score.total === solved.ten));
    }
    assert.ok(positions.size >= 3, `answer only ever at positions ${[...positions]}`);
  });
});

describe("beginnerChoices — realism", () => {
  it("never offers a mangan against a 1 han hand", () => {
    const [solved, choices] = choicesFor(OPEN_TANYAO);
    assert.equal(solved.han, 1);
    assert.equal(solved.ten, 1000);
    const highest = Math.max(...choices.scores.map((score) => score.total));
    assert.ok(highest <= 2600, `offered ${highest} to a 1 han hand`);
  });

  it("only offers 20 fu to a hand that can be a pinfu tsumo", () => {
    const [, ron] = choicesFor(PINFU);
    assert.ok(!ron.fu.includes(20), `offered 20 fu on a ron: ${ron.fu}`);
    assert.ok(!ron.fu.includes(25), `offered 25 fu to a normal hand: ${ron.fu}`);

    const [, tsumo] = choicesFor({ ...PINFU, winType: "tsumo" });
    assert.ok(tsumo.fu.includes(20), `no 20 fu for a pinfu tsumo: ${tsumo.fu}`);
  });

  it("offers 25 fu when the hand reads as seven pairs", () => {
    const [solved, choices] = choicesFor({
      ...PINFU,
      concealed: ["2m", "2m", "3m", "3m", "4m", "4m", "5p", "5p", "6p", "6p", "7p", "7p", "9s"],
      winningTile: "9s",
    });
    assert.equal(solved.fu, 40); // ryanpeikou beats it, but it is a fair guess
    assert.ok(choices.fu.includes(25), `no 25 fu offered: ${choices.fu}`);
  });

  it("keeps the han options to the quiz band", () => {
    const [, choices] = choicesFor(PINFU);
    assert.deepEqual(choices.han, [1, 2, 3, 4, 5]);
  });

  it("writes tsumo scores as the split, with the total alongside", () => {
    const [solved, choices] = choicesFor({ ...PINFU, winType: "tsumo" });
    assert.equal(solved.ten, 5200);
    const correct = choices.scores.find((score) => score.total === 5200);
    assert.deepEqual(correct, { value: "1300 / 2600", detail: "5200 total", total: 5200 });

    const [dealer, dealerChoices] = choicesFor({ ...PINFU, winType: "tsumo", seatWind: "east" });
    const each = dealer.tsumoPayment?.kind === "all" ? dealer.tsumoPayment.each : null;
    assert.ok(dealerChoices.scores.some((score) => score.value === `${each} all`));
  });

  it("fills the list even when the hand has few readings", () => {
    const [, choices] = choicesFor(PINFU);
    assert.equal(choices.fu.length, CHOICE_COUNT);
    assert.equal(choices.scores.length, CHOICE_COUNT);
  });
});
