import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allTiles,
  describeTile,
  doraFromIndicator,
  formatTiles,
  fromSolverTile,
  sortTiles,
  toSolverTile,
} from "@/lib/quiz/tiles";

describe("doraFromIndicator", () => {
  it("advances within a number suit", () => {
    assert.equal(doraFromIndicator("3m"), "4m");
    assert.equal(doraFromIndicator("1p"), "2p");
    assert.equal(doraFromIndicator("8s"), "9s");
  });

  it("wraps 9 back to 1 in each number suit", () => {
    assert.equal(doraFromIndicator("9m"), "1m");
    assert.equal(doraFromIndicator("9p"), "1p");
    assert.equal(doraFromIndicator("9s"), "1s");
  });

  it("cycles winds without leaking into dragons", () => {
    assert.equal(doraFromIndicator("1z"), "2z"); // East -> South
    assert.equal(doraFromIndicator("3z"), "4z"); // West -> North
    assert.equal(doraFromIndicator("4z"), "1z"); // North -> East
  });

  it("cycles dragons without leaking into winds", () => {
    assert.equal(doraFromIndicator("5z"), "6z"); // haku -> hatsu
    assert.equal(doraFromIndicator("6z"), "7z"); // hatsu -> chun
    assert.equal(doraFromIndicator("7z"), "5z"); // chun -> haku
  });

  it("maps every tile to a real tile", () => {
    const valid = new Set(allTiles());
    for (const tile of allTiles()) {
      assert.ok(valid.has(doraFromIndicator(tile)), `${tile} produced an invalid dora`);
    }
  });
});

describe("solver tile ids", () => {
  it("is 1-indexed, not 0-indexed like the deprecated riichi-ts", () => {
    assert.equal(toSolverTile("1m"), 1);
    assert.equal(toSolverTile("9m"), 9);
    assert.equal(toSolverTile("1p"), 10);
    assert.equal(toSolverTile("1s"), 19);
    assert.equal(toSolverTile("1z"), 28); // East
    assert.equal(toSolverTile("7z"), 34); // chun
  });

  it("round-trips every tile", () => {
    for (const tile of allTiles()) {
      assert.equal(fromSolverTile(toSolverTile(tile)), tile);
    }
  });

  it("assigns each tile a distinct id in 1..34", () => {
    const ids = allTiles().map(toSolverTile);
    assert.equal(new Set(ids).size, 34);
    assert.equal(Math.min(...ids), 1);
    assert.equal(Math.max(...ids), 34);
  });
});

describe("formatTiles", () => {
  it("groups runs by suit", () => {
    assert.equal(formatTiles(["2m", "3m", "4m", "5p", "6p"]), "234m 56p");
  });

  it("sorts before grouping", () => {
    assert.equal(formatTiles(["5p", "2m", "6p", "4m", "3m"]), "234m 56p");
  });

  it("keeps duplicate tiles", () => {
    assert.equal(formatTiles(["5s", "5s", "5s"]), "555s");
  });

  it("orders suits m, p, s, z", () => {
    assert.equal(formatTiles(["1z", "1s", "1p", "1m"]), "1m 1p 1s 1z");
  });

  it("returns an empty string for no tiles", () => {
    assert.equal(formatTiles([]), "");
  });
});

describe("sortTiles", () => {
  it("does not mutate its input", () => {
    const input = ["5p", "1m"];
    sortTiles(input);
    assert.deepEqual(input, ["5p", "1m"]);
  });
});

describe("red fives (aka dora)", () => {
  it("sorts with the fives, not at the front of the suit", () => {
    // The literal rank is 0, so a naive sort puts a red five before the 1s.
    assert.deepEqual(sortTiles(["4m", "0m", "5m", "6m"]), ["4m", "0m", "5m", "6m"]);
    assert.deepEqual(sortTiles(["9p", "0p", "1p"]), ["1p", "0p", "9p"]);
  });

  it("maps to the ordinary five's solver id, inside the valid range", () => {
    // Solver ids run 1-34; a literal rank 0 would map to 0 and be rejected.
    assert.equal(toSolverTile("0m"), toSolverTile("5m"));
    assert.equal(toSolverTile("0p"), toSolverTile("5p"));
    assert.equal(toSolverTile("0s"), toSolverTile("5s"));
    for (const tile of ["0m", "0p", "0s"]) {
      const id = toSolverTile(tile);
      assert.ok(id >= 1 && id <= 34, `${tile} -> ${id} out of range`);
    }
  });

  it("points at six as a dora indicator, rather than wrapping to one", () => {
    assert.equal(doraFromIndicator("0m"), "6m");
    assert.equal(doraFromIndicator("0s"), "6s");
  });

  it("is described as a red five", () => {
    assert.equal(describeTile("0s"), "red 5 sou");
    assert.equal(describeTile("5s"), "5 sou");
  });
});
