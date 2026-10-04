import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ImportedGameRow } from "@/lib/imports/types";
import { importedGameResults } from "@/lib/leaderboard/gameResults";
import { mergeImportedGamesIntoLeaderboard } from "@/lib/leaderboard/mergeImports";

function game(playedAt: string, scores: number[], aiSeat?: number): ImportedGameRow {
  return {
    id: playedAt,
    played_at: playedAt,
    starting_points: 25000,
    entries_json: scores.map((final_score, i) =>
      i === aiSeat
        ? { display_name: "AI", final_score, is_ai: true }
        : { player_id: `p${i}`, display_name: `P${i}`, final_score }
    ),
    mjs_paipu_url: null,
    mjs_record_uuid: null,
    created_at: playedAt,
  };
}

describe("importedGameResults", () => {
  it("adds uma for October 2026 games, in placement order", () => {
    const { usesUma, seats } = importedGameResults(
      game("2026-10-03T20:00:00Z", [20000, 45000, 10000, 25000])
    );
    assert.equal(usesUma, true);
    assert.deepEqual(
      seats.map((s) => [s.display_name, s.placement, s.score, s.uma, s.net]),
      [
        ["P1", 1, 20, 15, 35],
        ["P3", 2, 0, 5, 5],
        ["P0", 3, -5, -5, -10],
        ["P2", 4, -15, -15, -30],
      ]
    );
  });

  it("has no uma for games before the season (US Eastern month)", () => {
    // 2026-10-01 03:00 UTC is still September 30 in New York.
    const { usesUma, seats } = importedGameResults(
      game("2026-10-01T03:00:00Z", [20000, 45000, 10000, 25000])
    );
    assert.equal(usesUma, false);
    assert.ok(seats.every((s) => s.uma === null && s.net === s.score));
  });

  it("places AI seats and breaks ties toward East, matching the leaderboard", () => {
    const row = game("2026-10-10T20:00:00Z", [30000, 30000, 30000, 10000], 1);
    const { seats } = importedGameResults(row);
    assert.deepEqual(
      seats.map((s) => [s.display_name, s.uma]),
      [
        ["P0", 15],
        ["AI", 5],
        ["P2", -5],
        ["P3", -15],
      ]
    );

    const board = mergeImportedGamesIntoLeaderboard([], [row], { usePlacementBonus: true });
    for (const seat of seats.filter((s) => s.player_id)) {
      assert.equal(board.find((e) => e.playerId === seat.player_id)?.points, seat.net);
    }
  });
});
