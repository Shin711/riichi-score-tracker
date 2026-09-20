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
import { doraFromIndicator } from "@/lib/quiz/tiles";

const SAMPLE = 500;

function sample(seed = 4242) {
  const random = createRandom(seed);
  return Array.from({ length: SAMPLE }, () => generateQuizHand(random));
}

function kanCount(hand: QuizHand): number {
  return hand.melds.filter((meld) => meld.kind === "ankan" || meld.kind === "minkan").length;
}

/**
 * Every tile a posted quiz puts on screen, read straight off the raw fields.
 *
 * Deliberately not `allShownTiles` or `hasLegalTileCounts`: the generator gates
 * on those itself, so a test built from them passes no matter what they miss.
 * That is how an indicator matching a tile the hand already held four of once
 * reached the channel with this suite green.
 */
function tilesOnScreen(hand: QuizHand): string[] {
  const tiles = [
    ...hand.concealed,
    hand.winningTile,
    ...hand.melds.flatMap((meld) => meld.tiles),
    hand.doraIndicator,
  ];
  if (hand.uraDoraIndicator) tiles.push(hand.uraDoraIndicator);
  return tiles;
}

function mostCopies(tiles: string[]): { tile: string; copies: number } {
  const counts = new Map<string, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  let worst = { tile: "", copies: 0 };
  for (const [tile, copies] of counts) if (copies > worst.copies) worst = { tile, copies };
  return worst;
}

describe("generateQuizHand", () => {
  const hands = sample();

  it("never shows more than four copies of a tile, indicators included", () => {
    for (const { hand } of hands) {
      const worst = mostCopies(tilesOnScreen(hand));
      assert.ok(
        worst.copies <= 4,
        `${worst.copies} copies of ${worst.tile}: ${tilesOnScreen(hand).sort().join(",")}`
      );
    }
  });

  it("still gates on the indicators in hasLegalTileCounts", () => {
    // Four 3s in the hand and a fifth lying face-up on the wall: the exact shape
    // that was once posted.
    const hand: QuizHand = {
      concealed: ["2s", "3s", "4s", "5s", "6s", "7s", "2p", "3p", "4p", "9m"],
      melds: [{ kind: "pon", tiles: ["3s", "3s", "3s"] }],
      winningTile: "9m",
      winType: "ron",
      seatWind: "south",
      roundWind: "east",
      doraIndicator: "3s",
      riichi: false,
    };
    assert.equal(hasLegalTileCounts(hand), false);
    assert.equal(hasLegalTileCounts({ ...hand, doraIndicator: "1z" }), true);
  });

  it("counts the ura dora indicator toward the limit too", () => {
    // Three 5s on screen already — two in the hand, one as the dora indicator —
    // leaves exactly one for the ura dora indicator, and none after that.
    const hand: QuizHand = {
      concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
      melds: [],
      winningTile: "8p",
      winType: "ron",
      seatWind: "south",
      roundWind: "east",
      doraIndicator: "5s",
      uraDoraIndicator: "5s",
      riichi: true,
    };
    assert.equal(hasLegalTileCounts(hand), true);
    // A third 5s in the hand makes five on screen.
    assert.equal(hasLegalTileCounts({ ...hand, winningTile: "5s" }), false);
  });

  it("turns over an ura dora indicator exactly when the hand is riichi", () => {
    for (const { hand } of hands) {
      assert.equal(
        hand.uraDoraIndicator !== undefined,
        hand.riichi,
        `riichi=${hand.riichi} but ura dora indicator=${hand.uraDoraIndicator}`
      );
    }
    assert.ok(hands.some(({ hand }) => hand.riichi), "sample has no riichi hands");
    assert.ok(hands.some(({ hand }) => !hand.riichi), "sample has only riichi hands");
  });

  it("survives the JSON round trip through the database unchanged", () => {
    // An `uraDoraIndicator: undefined` key would vanish in storage and leave the
    // stored hand unequal to the one that was scored.
    for (const { hand } of hands) {
      assert.deepEqual(JSON.parse(JSON.stringify(hand)), hand);
    }
  });

  it("scores each indicator as the matching tiles in the hand", () => {
    const hanFor = (hand: QuizHand, indicator: string | undefined) =>
      indicator === undefined
        ? 0
        : allHandTiles(hand).filter((tile) => tile === doraFromIndicator(indicator)).length;
    const listed = (solved: { yaku: Array<{ name: string; han: number }> }, name: string) =>
      solved.yaku.find((y) => y.name === name)?.han ?? 0;

    for (const { hand, solved } of hands) {
      assert.equal(listed(solved, "Dora"), hanFor(hand, hand.doraIndicator));
      assert.equal(listed(solved, "Ura dora"), hanFor(hand, hand.uraDoraIndicator));
    }
  });

  it("actually produces hands where dora and ura dora score", () => {
    // Guards against the feature going quietly dead, e.g. an indicator bias that
    // never finds the hand.
    const scoring = (name: string) =>
      hands.filter(({ solved }) => solved.yaku.some((y) => y.name === name)).length;
    assert.ok(scoring("Dora") > 0, "no hand in the sample scored dora");
    assert.ok(scoring("Ura dora") > 0, "no hand in the sample scored ura dora");
  });

  it("lists yaku that add up to the han it publishes", () => {
    for (const { solved } of hands) {
      assert.equal(
        solved.yaku.reduce((sum, y) => sum + y.han, 0),
        solved.han
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
