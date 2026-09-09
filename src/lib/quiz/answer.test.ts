import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gradeAnswer, parseCount, parseScore, type ScoreAnswer } from "@/lib/quiz/answer";
import type { SolvedHand } from "@/lib/quiz/solve";

function solved(overrides: Partial<SolvedHand> = {}): SolvedHand {
  return {
    han: 3,
    fu: 30,
    ten: 3900,
    tsumoPayment: null,
    yaku: [{ name: "Riichi", han: 1 }],
    yakumanCount: 0,
    isDealer: false,
    ...overrides,
  };
}

describe("parseCount", () => {
  it("reads a bare number", () => {
    assert.equal(parseCount("3"), 3);
    assert.equal(parseCount("40"), 40);
  });

  it("tolerates units and spacing", () => {
    assert.equal(parseCount(" 3 han "), 3);
    assert.equal(parseCount("40fu"), 40);
    assert.equal(parseCount("2h"), 2);
  });

  it("normalises full-width digits", () => {
    assert.equal(parseCount("３"), 3);
  });

  it("rejects nonsense", () => {
    assert.equal(parseCount(""), null);
    assert.equal(parseCount("many"), null);
    assert.equal(parseCount("3.5"), null);
  });
});

describe("parseScore", () => {
  it("reads a total, with or without separators", () => {
    assert.deepEqual(parseScore("3900"), { kind: "total", value: 3900 });
    assert.deepEqual(parseScore("3,900"), { kind: "total", value: 3900 });
    assert.deepEqual(parseScore(" 8000 pts "), { kind: "total", value: 8000 });
  });

  it("reads a tsumo split on either separator", () => {
    assert.deepEqual(parseScore("1300/2600"), { kind: "split", parts: [1300, 2600] });
    assert.deepEqual(parseScore("500-1000"), { kind: "split", parts: [500, 1000] });
    assert.deepEqual(parseScore("500 / 1000"), { kind: "split", parts: [500, 1000] });
  });

  it("reads the dealer 'all' shorthand", () => {
    assert.deepEqual(parseScore("2000all"), { kind: "split", parts: [2000] });
    assert.deepEqual(parseScore("2000 all"), { kind: "split", parts: [2000] });
  });

  it("rejects nonsense", () => {
    assert.equal(parseScore(""), null);
    assert.equal(parseScore("lots"), null);
  });
});

describe("gradeAnswer — ron", () => {
  const hand = solved();

  it("accepts the exact answer", () => {
    const grade = gradeAnswer(hand, { han: 3, fu: 30, score: { kind: "total", value: 3900 } });
    assert.deepEqual(
      { han: grade.han, fu: grade.fu, score: grade.score, correct: grade.correct },
      { han: true, fu: true, score: true, correct: true }
    );
  });

  it("marks a wrong fu as incorrect overall", () => {
    const grade = gradeAnswer(hand, { han: 3, fu: 40, score: { kind: "total", value: 3900 } });
    assert.equal(grade.fu, false);
    assert.equal(grade.correct, false);
  });

  it("marks a wrong score as incorrect overall", () => {
    const grade = gradeAnswer(hand, { han: 3, fu: 30, score: { kind: "total", value: 5200 } });
    assert.equal(grade.score, false);
    assert.equal(grade.correct, false);
  });
});

describe("gradeAnswer — non-dealer tsumo", () => {
  const hand = solved({
    han: 4,
    fu: 20,
    ten: 5200,
    tsumoPayment: { kind: "split", fromDealer: 2600, fromNonDealer: 1300 },
  });

  const accepts = (score: ScoreAnswer) =>
    gradeAnswer(hand, { han: 4, fu: 20, score }).score;

  it("accepts the conventional ko/oya split", () => {
    assert.ok(accepts({ kind: "split", parts: [1300, 2600] }));
  });

  it("accepts the split written the other way round", () => {
    assert.ok(accepts({ kind: "split", parts: [2600, 1300] }));
  });

  it("accepts the total instead of the split", () => {
    assert.ok(accepts({ kind: "total", value: 5200 }));
  });

  it("rejects a plausible but wrong split", () => {
    assert.ok(!accepts({ kind: "split", parts: [1300, 1300] }));
  });
});

describe("gradeAnswer — dealer tsumo", () => {
  // 2 han 30 fu dealer tsumo: 1000 from all three, 3000 total.
  const hand = solved({
    han: 2,
    fu: 30,
    ten: 3000,
    isDealer: true,
    tsumoPayment: { kind: "all", each: 1000 },
  });

  const accepts = (score: ScoreAnswer) =>
    gradeAnswer(hand, { han: 2, fu: 30, score }).score;

  it("accepts the per-player 'all' amount", () => {
    assert.ok(accepts({ kind: "split", parts: [1000] }));
    assert.ok(accepts({ kind: "total", value: 1000 }));
  });

  it("accepts the total", () => {
    assert.ok(accepts({ kind: "total", value: 3000 }));
  });

  it("rejects the non-dealer share, which is not what anyone pays here", () => {
    assert.ok(!accepts({ kind: "total", value: 500 }));
  });
});

describe("gradeAnswer — mangan and above", () => {
  const mangan = solved({ han: 5, fu: 40, ten: 8000 });

  it("does not hold fu against the player once han alone reaches mangan", () => {
    const grade = gradeAnswer(mangan, {
      han: 5,
      fu: 999,
      score: { kind: "total", value: 8000 },
    });
    assert.equal(grade.fuScored, false);
    assert.equal(grade.correct, true);
  });

  it("still grades fu below mangan", () => {
    const grade = gradeAnswer(solved({ han: 4, fu: 30, ten: 7700 }), {
      han: 4,
      fu: 999,
      score: { kind: "total", value: 7700 },
    });
    assert.equal(grade.fuScored, true);
    assert.equal(grade.correct, false);
  });
});
