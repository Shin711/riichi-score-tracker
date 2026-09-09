/**
 * Scoring tests. Every expected value here is worked out by hand from the
 * standard rules rather than copied from the solver, so these catch the solver
 * changing behaviour under us as well as our own wiring mistakes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuizHand } from "@/lib/quiz/hand";
import { solveHand } from "@/lib/quiz/solve";

/** 234m 567m 345p 67p 55s — tenpai on 5p/8p, a ryanmen wait. */
const PINFU_CONCEALED = [
  "2m", "3m", "4m",
  "5m", "6m", "7m",
  "3p", "4p", "5p",
  "6p", "7p",
  "5s", "5s",
];

function hand(overrides: Partial<QuizHand> = {}): QuizHand {
  return {
    concealed: PINFU_CONCEALED,
    melds: [],
    winningTile: "8p",
    winType: "ron",
    seatWind: "south",
    roundWind: "east",
    doraIndicator: "1z", // East -> South, unrelated to this hand
    riichi: true,
    ...overrides,
  };
}

describe("solveHand — closed pinfu hand", () => {
  it("scores riichi + pinfu + tanyao ron as 3 han 30 fu / 3900", () => {
    // 20 base + 10 menzen ron, pinfu adds nothing = 30 fu.
    // base points 30 * 2^(3+2) = 960; non-dealer ron = 960 * 4 = 3840 -> 3900.
    const result = solveHand(hand());
    assert.equal(result.han, 3);
    assert.equal(result.fu, 30);
    assert.equal(result.ten, 3900);
    assert.equal(result.tsumoPayment, null);
    assert.equal(result.yakumanCount, 0);
  });

  it("scores the same hand on tsumo as 4 han 20 fu / 1300-2600", () => {
    // Pinfu tsumo is the fixed 20 fu case; menzen tsumo adds the fourth han.
    // base 20 * 2^(4+2) = 1280; dealer pays 2x -> 2600, others 1300 each.
    const result = solveHand(hand({ winType: "tsumo" }));
    assert.equal(result.han, 4);
    assert.equal(result.fu, 20);
    assert.equal(result.ten, 5200);
    assert.deepEqual(result.tsumoPayment, {
      kind: "split",
      fromDealer: 2600,
      fromNonDealer: 1300,
    });
  });

  it("lists the yaku it found", () => {
    const names = solveHand(hand()).yaku.map((y) => y.name);
    assert.ok(names.includes("Riichi"));
    assert.ok(names.includes("Pinfu"));
    assert.ok(names.includes("Tanyao"));
  });

  it("drops the riichi han when the hand is open", () => {
    // Riichi is impossible with a called meld; the flag must not survive.
    const open = solveHand(
      hand({
        concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "5s"],
        melds: [{ kind: "chi", tiles: ["6p", "7p", "8p"] }],
        winningTile: "5s",
        riichi: true,
      })
    );
    assert.ok(!open.yaku.some((y) => y.name === "Riichi"));
  });
});

describe("solveHand — dora", () => {
  it("counts dora from the indicator, not the indicator tile itself", () => {
    // Indicator 4s points at 5s, and the hand holds two of them: +2 han.
    const withDora = solveHand(hand({ doraIndicator: "4s" }));
    assert.equal(withDora.han, 5);
    assert.ok(withDora.yaku.some((y) => y.name === "Dora" && y.han === 2));
  });

  it("does not count the indicator tile as dora", () => {
    // Indicator 5s would only matter if we wrongly passed indicators through.
    const noDora = solveHand(hand({ doraIndicator: "5s" }));
    assert.equal(noDora.han, 3);
    assert.ok(!noDora.yaku.some((y) => y.name === "Dora"));
  });
});

describe("solveHand — tsumo payments", () => {
  /** 234m 567m 345p 678p 55s, tanki on 5s: tanyao + tsumo, 30 fu. */
  const tankiTsumo = (seatWind: QuizHand["seatWind"]): QuizHand => ({
    concealed: ["2m","3m","4m","5m","6m","7m","3p","4p","5p","6p","7p","8p","5s"],
    melds: [],
    winningTile: "5s",
    winType: "tsumo",
    seatWind,
    roundWind: "east",
    doraIndicator: "1z",
    riichi: false,
  });

  it("splits a non-dealer tsumo as 500/1000", () => {
    // 2 han 30 fu, base 480. Dealer pays 960 -> 1000, others 480 -> 500.
    const result = solveHand(tankiTsumo("south"));
    assert.equal(result.han, 2);
    assert.equal(result.fu, 30);
    assert.deepEqual(result.tsumoPayment, {
      kind: "split",
      fromDealer: 1000,
      fromNonDealer: 500,
    });
    assert.equal(result.ten, 2000); // 1000 + 500 + 500
  });

  it("charges every opponent alike on a dealer tsumo", () => {
    // Same 2 han 30 fu, but the dealer collects 2 x 480 = 960 -> 1000 from all
    // three. Reading the solver's second figure here would give 500 and be wrong.
    const result = solveHand(tankiTsumo("east"));
    assert.deepEqual(result.tsumoPayment, { kind: "all", each: 1000 });
    assert.equal(result.ten, 3000); // 1000 x 3
    assert.equal(result.isDealer, true);
  });

  it("keeps the dealer tsumo total consistent with the per-player amount", () => {
    const result = solveHand(tankiTsumo("east"));
    assert.equal(result.tsumoPayment?.kind, "all");
    if (result.tsumoPayment?.kind === "all") {
      assert.equal(result.tsumoPayment.each * 3, result.ten);
    }
  });
});

describe("solveHand — melds and fu", () => {
  it("counts a closed kan of terminals as 32 fu", () => {
    // 20 base + 32 ankan(9m) + 2 tanki + 2 tsumo = 56 -> 60 fu.
    // 1 han 60 fu non-dealer tsumo: base 480, so 500/1000 = 2000 total.
    const result = solveHand({
      concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "5s"],
      melds: [{ kind: "ankan", tiles: ["9m", "9m", "9m", "9m"] }],
      winningTile: "5s",
      winType: "tsumo",
      seatWind: "south",
      roundWind: "east",
      doraIndicator: "1z",
      riichi: false,
    });
    assert.equal(result.han, 1);
    assert.equal(result.fu, 60);
    assert.equal(result.ten, 2000);
  });

  it("scores an open yakuhai triplet", () => {
    // Chun pon = 1 han. 20 base + 4 (open honor triplet) + 2 tsumo = 26 -> 30 fu.
    const result = solveHand({
      concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "5s"],
      melds: [{ kind: "pon", tiles: ["7z", "7z", "7z"] }],
      winningTile: "5s",
      winType: "tsumo",
      seatWind: "south",
      roundWind: "east",
      doraIndicator: "1z",
      riichi: false,
    });
    assert.equal(result.han, 1);
    assert.equal(result.fu, 30);
    assert.ok(result.yaku.some((y) => y.name === "Chun"));
  });
});
