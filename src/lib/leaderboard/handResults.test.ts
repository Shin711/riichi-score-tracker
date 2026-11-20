import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handResultsFromWinningHands,
  parseHandResults,
  storedHandResults,
} from "@/lib/leaderboard/handResults";

describe("storedHandResults", () => {
  it("returns null when the stats never included a hand list", () => {
    assert.equal(storedHandResults(null), null);
    assert.equal(storedHandResults({}), null);
  });

  it("keeps rons and tsumo and drops a ron with no discarder", () => {
    assert.deepEqual(
      storedHandResults({
        winningHands: [
          { seat: 1, points: 5200, tsumo: false, dealInSeat: 0 },
          { seat: 2, points: 12000.4, tsumo: true, dealInSeat: 0 },
          { seat: 3, points: 8000, tsumo: false, dealInSeat: null },
        ],
      }),
      [
        { winnerSeat: 1, dealInSeat: 0, points: 5200 },
        { winnerSeat: 2, dealInSeat: null, points: 12000 },
      ]
    );
  });
});

describe("handResultsFromWinningHands", () => {
  it("drops a seat that dealt into itself", () => {
    assert.deepEqual(
      handResultsFromWinningHands([{ seat: 1, points: 1000, tsumo: false, dealInSeat: 1 }]),
      []
    );
  });
});

describe("parseHandResults", () => {
  it("reads a stored list and treats null as unknown", () => {
    const hands = [{ winnerSeat: 0, dealInSeat: 2, points: 8000 }];
    assert.deepEqual(parseHandResults(hands), hands);
    assert.equal(parseHandResults(null), null);
    assert.deepEqual(parseHandResults([]), []);
  });

  it("rejects a list that would attribute a hand to the wrong seat", () => {
    assert.equal(parseHandResults([{ winnerSeat: 0, dealInSeat: 9, points: 1000 }]), null);
    assert.equal(parseHandResults([{ winnerSeat: 0, dealInSeat: 0, points: 1000 }]), null);
    assert.equal(parseHandResults("nope"), null);
  });
});
