/**
 * Invariants for generated hands. These run over a large sample because the
 * generator is random: a bug that fires on 1% of hands is a bug that fires in
 * the Discord channel about once a quarter.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateQuizHand, hasLegalTileCounts } from "@/lib/quiz/generate";
import { allHandTiles, isClosedHand, type QuizHand } from "@/lib/quiz/hand";
import { createRandom } from "@/lib/quiz/random";
import { solveHand } from "@/lib/quiz/solve";

const SAMPLE = 500;

function sample(seed = 4242) {
  const random = createRandom(seed);
  return Array.from({ length: SAMPLE }, () => generateQuizHand(random));
}

function kanCount(hand: QuizHand): number {
  return hand.melds.filter((meld) => meld.kind === "ankan" || meld.kind === "minkan").length;
}

describe("generateQuizHand", () => {
  const hands = sample();

  it("never uses more than four copies of a tile", () => {
    for (const { hand } of hands) {
      assert.ok(
        hasLegalTileCounts(hand),
        `illegal tile counts: ${allHandTiles(hand).sort().join(",")}`
      );
    }
  });

  it("holds fourteen tiles, plus one for each kan", () => {
    for (const { hand } of hands) {
      assert.equal(allHandTiles(hand).length, 14 + kanCount(hand));
    }
  });

  it("draws the winning tile from the concealed part, never from a meld", () => {
    for (const { hand } of hands) {
      // Each meld accounts for exactly one of the hand's five blocks, so the
      // concealed part plus the winning tile must cover the rest. If the winning
      // tile were taken from inside a meld this count would come up short.
      const nonMeld = hand.concealed.length + 1;
      assert.equal(
        nonMeld,
        14 - 3 * hand.melds.length,
        `concealed part does not account for the winning tile (melds: ${hand.melds.length})`
      );
    }
  });

  it("stays inside the requested han band", () => {
    for (const { solved } of hands) {
      assert.ok(solved.han >= 1 && solved.han <= 5, `han out of band: ${solved.han}`);
    }
  });

  it("never produces a yakuman", () => {
    for (const { solved } of hands) {
      assert.equal(solved.yakumanCount, 0);
    }
  });

  it("always has at least one yaku", () => {
    for (const { solved } of hands) {
      assert.ok(solved.yaku.length > 0);
    }
  });

  it("only declares riichi on a closed hand", () => {
    for (const { hand } of hands) {
      if (hand.riichi) assert.ok(isClosedHand(hand.melds), "riichi on an open hand");
    }
  });

  it("reports fu that is a legal value", () => {
    const legal = new Set([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
    for (const { solved } of hands) {
      assert.ok(legal.has(solved.fu), `unexpected fu: ${solved.fu}`);
    }
  });

  it("gives every tsumo a payment breakdown and every ron none", () => {
    for (const { hand, solved } of hands) {
      if (hand.winType === "tsumo") {
        assert.ok(solved.tsumoPayment, "tsumo without a payment breakdown");
      } else {
        assert.equal(solved.tsumoPayment, null);
      }
    }
  });

  it("keeps tsumo payments consistent with the total", () => {
    for (const { solved } of hands) {
      const payment = solved.tsumoPayment;
      if (!payment) continue;
      const total =
        payment.kind === "all"
          ? payment.each * 3
          : payment.fromDealer + payment.fromNonDealer * 2;
      assert.equal(total, solved.ten);
    }
  });

  it("re-solves to the answer it published", () => {
    // The stored answer must survive a database round trip, so solving the hand
    // again has to give the identical result.
    for (const { hand, solved } of hands.slice(0, 100)) {
      const again = solveHand(hand);
      assert.equal(again.han, solved.han);
      assert.equal(again.fu, solved.fu);
      assert.equal(again.ten, solved.ten);
    }
  });
});

describe("generateQuizHand — determinism", () => {
  it("produces the same hand for the same seed", () => {
    const a = generateQuizHand(createRandom(7));
    const b = generateQuizHand(createRandom(7));
    assert.deepEqual(a.hand, b.hand);
    assert.deepEqual(a.solved, b.solved);
  });

  it("produces different hands for different seeds", () => {
    const a = generateQuizHand(createRandom(7));
    const b = generateQuizHand(createRandom(8));
    assert.notDeepEqual(a.hand, b.hand);
  });
});

describe("generateQuizHand — options", () => {
  it("honours a narrower han band", () => {
    const random = createRandom(31337);
    for (let i = 0; i < 40; i += 1) {
      const { solved } = generateQuizHand(random, { minHan: 3, maxHan: 4 });
      assert.ok(solved.han >= 3 && solved.han <= 4, `han ${solved.han} outside 3-4`);
    }
  });
});
