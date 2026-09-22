/**
 * Fu explanations. Every expected line is worked out by hand from the
 * standard table, so these catch a wrong reading on our side as well as a
 * rule the solver applies differently — the two must agree or nothing is shown.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { explainFu, possibleFu, withFuBreakdown, type FuLine } from "@/lib/quiz/fu";
import { generateQuizHand } from "@/lib/quiz/generate";
import type { QuizHand } from "@/lib/quiz/hand";
import { createRandom } from "@/lib/quiz/random";
import { solveHand } from "@/lib/quiz/solve";

/** 234m 567m 345p 67p 55s, ron 8p under riichi: pinfu, 30 fu. */
function hand(overrides: Partial<QuizHand> = {}): QuizHand {
  return {
    concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
    melds: [],
    winningTile: "8p",
    winType: "ron",
    seatWind: "south",
    roundWind: "east",
    doraIndicator: "1z",
    riichi: true,
    ...overrides,
  };
}

/** Solves, checks the lines add up to the solver's fu, and returns both. */
function explain(h: QuizHand): { fu: number; lines: string[] } {
  const solved = solveHand(h);
  assert.ok(solved.fuBreakdown, "solver attached no fu breakdown");
  const total = solved.fuBreakdown.reduce((sum, line) => sum + line.fu, 0);
  assert.equal(total, solved.fu, "fu lines do not add up to the fu");
  return { fu: solved.fu, lines: solved.fuBreakdown.map((line) => `${line.name} — ${line.fu}`) };
}

describe("explainFu — closed hands", () => {
  it("pinfu ron is the base and the closed-ron bonus, nothing else", () => {
    const { fu, lines } = explain(hand());
    assert.equal(fu, 30);
    assert.deepEqual(lines, [
      "Base — 20",
      "Closed hand, won by ron — 10",
      "Ryanmen wait, 8 pin completing 678p — 0",
    ]);
  });

  it("pinfu tsumo waives the tsumo fu, leaving 20", () => {
    const { fu, lines } = explain(hand({ winType: "tsumo" }));
    assert.equal(fu, 20);
    assert.deepEqual(lines, [
      "Base — 20",
      "Tsumo, waived for pinfu — 0",
      "Ryanmen wait, 8 pin completing 678p — 0",
    ]);
  });

  it("a kanchan wait adds 2 and the total rounds up", () => {
    // 3p5p waiting on 4p: 20 + 10 + 2 = 32 -> 40.
    const { fu, lines } = explain(
      hand({
        concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "5p", "6p", "7p", "8p", "5s", "5s"],
        winningTile: "4p",
      })
    );
    assert.equal(fu, 40);
    assert.deepEqual(lines, [
      "Base — 20",
      "Closed hand, won by ron — 10",
      "Kanchan wait, 4 pin completing 345p — 2",
      "Rounded up from 32 to 40 — 8",
    ]);
  });

  it("a penchan wait adds 2", () => {
    // 12m waiting on 3m.
    const { lines } = explain(
      hand({
        concealed: ["1m", "2m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "8p", "5s", "5s"],
        winningTile: "3m",
      })
    );
    assert.ok(lines.includes("Penchan wait, 3 man completing 123m — 2"), lines.join("\n"));
  });

  it("a tanki wait adds 2", () => {
    const { fu, lines } = explain(
      hand({
        concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "8p", "5s"],
        winningTile: "5s",
      })
    );
    assert.equal(fu, 40);
    assert.ok(lines.includes("Tanki wait, 5 sou completing the pair — 2"), lines.join("\n"));
  });

  it("prices a closed honor triplet at 8", () => {
    // 20 + 10 + 8 = 38 -> 40.
    const { fu, lines } = explain(
      hand({
        concealed: ["7z", "7z", "7z", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
      })
    );
    assert.equal(fu, 40);
    assert.deepEqual(lines, [
      "Base — 20",
      "Closed hand, won by ron — 10",
      "Closed triplet of Red dragon — 8",
      "Ryanmen wait, 8 pin completing 678p — 0",
      "Rounded up from 38 to 40 — 2",
    ]);
  });

  it("counts a triplet completed by ron as open, and by tsumo as closed", () => {
    // 111m closed (8); 555p finished on the shanpon.
    const shanpon = hand({
      concealed: ["1m", "1m", "1m", "5p", "5p", "2s", "3s", "4s", "6s", "7s", "8s", "3z", "3z"],
      winningTile: "5p",
    });

    // Ron: 20 + 10 + 8 + 2 (open simple triplet) = 40 exactly. Counting the
    // triplet as closed would give 42 -> 50, which the solver does not do.
    const ron = explain(shanpon);
    assert.equal(ron.fu, 40);
    assert.deepEqual(ron.lines, [
      "Base — 20",
      "Closed hand, won by ron — 10",
      "Closed triplet of 1 man — 8",
      "Triplet of 5 pin, completed by ron so counted as open — 2",
      "Shanpon wait, 5 pin completing 555p — 0",
    ]);

    // Tsumo: 20 + 2 + 8 + 4 = 34 -> 40.
    const tsumo = explain({ ...shanpon, winType: "tsumo" });
    assert.equal(tsumo.fu, 40);
    assert.deepEqual(tsumo.lines, [
      "Base — 20",
      "Tsumo — 2",
      "Closed triplet of 1 man — 8",
      "Closed triplet of 5 pin — 4",
      "Shanpon wait, 5 pin completing 555p — 0",
      "Rounded up from 34 to 40 — 6",
    ]);
  });

  it("prices a closed kan of simples at 16", () => {
    // 20 + 10 + 16 = 46 -> 50.
    const { fu, lines } = explain(
      hand({
        concealed: ["2m", "3m", "4m", "3p", "4p", "5p", "6p", "7p", "6s", "6s"],
        melds: [{ kind: "ankan", tiles: ["5m", "5m", "5m", "5m"] }],
      })
    );
    assert.equal(fu, 50);
    assert.deepEqual(lines, [
      "Base — 20",
      "Closed hand, won by ron — 10",
      "Closed kan of 5 man — 16",
      "Ryanmen wait, 8 pin completing 678p — 0",
      "Rounded up from 46 to 50 — 4",
    ]);
  });
});

describe("explainFu — pairs", () => {
  /** 234m 555m 3p5p 678p 11z, tsumo 4p: menzen tsumo only. */
  const doubleWind = (seatWind: QuizHand["seatWind"]) =>
    hand({
      concealed: ["2m", "3m", "4m", "5m", "5m", "5m", "3p", "5p", "6p", "7p", "8p", "1z", "1z"],
      winningTile: "4p",
      winType: "tsumo",
      seatWind,
      riichi: false,
    });

  it("gives a pair of the seat-and-round wind 4", () => {
    // 20 + 2 + 4 + 4 + 2 = 32 -> 40. At 2 for the pair it would stay at 30.
    const { fu, lines } = explain(doubleWind("east"));
    assert.equal(fu, 40);
    assert.deepEqual(lines, [
      "Base — 20",
      "Tsumo — 2",
      "Closed triplet of 5 man — 4",
      "Pair of East wind, seat and round wind — 4",
      "Kanchan wait, 4 pin completing 345p — 2",
      "Rounded up from 32 to 40 — 8",
    ]);
  });

  it("gives a pair of the round wind alone 2", () => {
    const { fu, lines } = explain(doubleWind("south"));
    assert.equal(fu, 30);
    assert.ok(lines.includes("Pair of East wind, round wind — 2"), lines.join("\n"));
  });

  it("gives a pair of dragons 2", () => {
    // 20 + 2 + 2 = 24 -> 30, and no pinfu because of the pair.
    const { fu, lines } = explain(
      hand({
        concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "7z", "7z"],
        winType: "tsumo",
        riichi: false,
      })
    );
    assert.equal(fu, 30);
    assert.deepEqual(lines, [
      "Base — 20",
      "Tsumo — 2",
      "Pair of Red dragon, dragon — 2",
      "Ryanmen wait, 8 pin completing 678p — 0",
      "Rounded up from 24 to 30 — 6",
    ]);
  });
});

describe("explainFu — open hands", () => {
  it("counts an open hand with nothing but the base as 30", () => {
    const { fu, lines } = explain(
      hand({
        concealed: ["5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
        melds: [{ kind: "chi", tiles: ["2m", "3m", "4m"] }],
      })
    );
    assert.equal(fu, 30);
    assert.deepEqual(lines, [
      "Base — 20",
      "Ryanmen wait, 8 pin completing 678p — 0",
      "Open hand with no other fu counts as 30 — 10",
    ]);
  });

  it("prices an open triplet of simples at 2", () => {
    // 20 + 2 + 2 = 24 -> 30.
    const { fu, lines } = explain(
      hand({
        concealed: ["2m", "3m", "4m", "3p", "5p", "6p", "7p", "8p", "6s", "6s"],
        melds: [{ kind: "pon", tiles: ["5m", "5m", "5m"] }],
        winningTile: "4p",
      })
    );
    assert.equal(fu, 30);
    assert.deepEqual(lines, [
      "Base — 20",
      "Open triplet of 5 man — 2",
      "Kanchan wait, 4 pin completing 345p — 2",
      "Rounded up from 24 to 30 — 6",
    ]);
  });

  it("prices an open kan of honors at 16", () => {
    // 20 + 16 = 36 -> 40.
    const { fu, lines } = explain(
      hand({
        concealed: ["2m", "3m", "4m", "3p", "4p", "5p", "6p", "7p", "6s", "6s"],
        melds: [{ kind: "minkan", tiles: ["7z", "7z", "7z", "7z"] }],
        riichi: false,
      })
    );
    assert.equal(fu, 40);
    assert.deepEqual(lines, [
      "Base — 20",
      "Open kan of Red dragon — 16",
      "Ryanmen wait, 8 pin completing 678p — 0",
      "Rounded up from 36 to 40 — 4",
    ]);
  });
});

describe("explainFu — special shapes", () => {
  it("gives seven pairs the fixed 25", () => {
    const { fu, lines } = explain(
      hand({
        concealed: ["1m", "1m", "3m", "3m", "5p", "5p", "7p", "7p", "2s", "2s", "9s", "9s", "3z"],
        winningTile: "3z",
        riichi: false,
      })
    );
    assert.equal(fu, 25);
    assert.deepEqual(lines, ["Seven pairs, always 25 — 25"]);
  });

  it("follows the solver to ryanpeikou when it beats seven pairs", () => {
    const shape = hand({
      concealed: ["2m", "2m", "3m", "3m", "4m", "4m", "5p", "5p", "6p", "6p", "7p", "7p", "9s"],
      winningTile: "9s",
    });
    const { fu, lines } = explain(shape);
    assert.equal(fu, 40);
    assert.ok(lines.includes("Tanki wait, 9 sou completing the pair — 2"), lines.join("\n"));
    // Both readings are on the table for the beginner options, though.
    assert.deepEqual(possibleFu(shape), [25, 40]);
  });

  it("picks the reading the solver scored when the win tile fits two", () => {
    // 4m finishes 234m (ryanmen, pinfu) or the 44m pair (tanki). The solver
    // takes pinfu, so the ryanmen reading must be the one explained.
    const shape = hand({
      concealed: ["2m", "3m", "4m", "4m", "5p", "6p", "7p", "3s", "4s", "5s", "6s", "7s", "8s"],
      winningTile: "4m",
    });
    const { fu, lines } = explain(shape);
    assert.equal(fu, 30);
    assert.ok(lines.includes("Ryanmen wait, 4 man completing 234m — 0"), lines.join("\n"));
    assert.deepEqual(possibleFu(shape), [30, 40]);
  });
});

describe("explainFu — refusing to guess", () => {
  it("gives nothing when no reading matches the fu", () => {
    assert.equal(explainFu(hand(), { fu: 40, yaku: [{ name: "Pinfu" }] }), null);
  });

  it("gives nothing when the only matching reading contradicts the yaku", () => {
    // 30 fu on this closed ron is only reachable as pinfu, which is not listed.
    assert.equal(explainFu(hand(), { fu: 30, yaku: [{ name: "Riichi" }] }), null);
  });
});

describe("withFuBreakdown", () => {
  type StoredAnswer = { fu: number; yaku: Array<{ name: string }>; fuBreakdown?: FuLine[] };

  it("fills in the lines for an answer stored without them", () => {
    const stored: StoredAnswer = { fu: 30, yaku: [{ name: "Pinfu" }, { name: "Riichi" }] };
    const filled = withFuBreakdown(hand(), stored);
    assert.ok(filled.fuBreakdown);
    assert.equal(filled.fuBreakdown[0].name, "Base");
  });

  it("leaves an answer that already has them alone", () => {
    const stored: StoredAnswer = {
      fu: 30,
      yaku: [{ name: "Pinfu" }],
      fuBreakdown: [{ name: "Base", fu: 20 }],
    };
    assert.equal(withFuBreakdown(hand(), stored), stored);
  });
});

describe("explainFu — generated hands", () => {
  const random = createRandom(2718);
  const hands = Array.from({ length: 500 }, () => generateQuizHand(random));

  it("explains every hand the generator produces", () => {
    const unexplained = hands.filter(({ solved }) => !solved.fuBreakdown);
    assert.equal(
      unexplained.length,
      0,
      `no fu breakdown for ${unexplained.length} hands, e.g. ${JSON.stringify(unexplained[0]?.hand)}`
    );
  });

  it("lists fu lines that add up to the fu it publishes", () => {
    for (const { solved } of hands) {
      const total = (solved.fuBreakdown ?? []).reduce((sum, line) => sum + line.fu, 0);
      assert.equal(total, solved.fu);
    }
  });

  it("always has the solver's fu among the possible readings", () => {
    for (const { hand: h, solved } of hands) {
      assert.ok(possibleFu(h).includes(solved.fu), `${solved.fu} not in ${possibleFu(h)}`);
    }
  });

  it("survives the JSON round trip through the database unchanged", () => {
    for (const { solved } of hands) {
      assert.deepEqual(JSON.parse(JSON.stringify(solved)), solved);
    }
  });
});
