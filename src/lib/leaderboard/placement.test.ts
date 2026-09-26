import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeImportedGamesIntoLeaderboard } from "@/lib/leaderboard/mergeImports";
import { umaAdjustments } from "@/lib/leaderboard/placement";
import { getLeaderboardScoringOptions } from "@/lib/leaderboard/qualification";
import type { ImportedGameRow } from "@/lib/imports/types";

describe("umaAdjustments", () => {
  it("gives +15/+5/-5/-15 by final score, with no oka", () => {
    assert.deepEqual(umaAdjustments([20000, 45000, 5000, 30000]), [-5, 15, -15, 5]);
  });

  it("matches the Mahjong Soul result screen (45,000 1st = +35)", () => {
    const scores = [45000, 25000, 20000, 10000];
    const uma = umaAdjustments(scores);
    assert.deepEqual(
      scores.map((s, i) => (s - 25000) / 1000 + uma[i]),
      [35, 5, -10, -30]
    );
  });

  it("breaks ties toward the seat closer to East, like Mahjong Soul", () => {
    assert.deepEqual(umaAdjustments([25000, 25000, 25000, 25000]), [15, 5, -5, -15]);
    assert.deepEqual(umaAdjustments([10000, 40000, 40000, 10000]), [-5, 15, 5, -15]);
  });
});

describe("season scoring", () => {
  it("starts in October 2026 and continues every month after", () => {
    assert.equal(getLeaderboardScoringOptions({ year: 2026, month: 9 }).usePlacementBonus, false);
    assert.equal(getLeaderboardScoringOptions({ year: 2026, month: 9 }).confidenceWeighted, true);
    for (const period of [
      { year: 2026, month: 10 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2028, month: 6 },
    ]) {
      const scoring = getLeaderboardScoringOptions(period);
      assert.equal(scoring.usePlacementBonus, true);
      assert.equal(scoring.confidenceWeighted, false);
      assert.equal(scoring.useRating, true);
    }
  });

  const game = (scores: number[], humans: string[]): ImportedGameRow => ({
    id: "g",
    played_at: "2026-10-05T00:00:00Z",
    starting_points: 25000,
    entries_json: scores.map((final_score, i) => ({
      player_id: humans[i],
      display_name: humans[i] ?? `AI ${i}`,
      final_score,
      is_ai: !humans[i],
    })),
    mjs_paipu_url: null,
    mjs_record_uuid: null,
    created_at: "2026-10-05T00:00:00Z",
  });

  it("adds the bonus to net and ranks by plain net", () => {
    const options = getLeaderboardScoringOptions({ year: 2026, month: 10 });
    const entries = mergeImportedGamesIntoLeaderboard(
      [],
      [game([40000, 30000, 20000, 10000], ["a", "b", "c", "d"]), game([10000, 20000, 30000, 40000], ["a", "b", "c", "d"])],
      options
    );
    const byId = Object.fromEntries(entries.map((e) => [e.playerId, e]));
    // a: 1st (+15 +15 = 30) then 4th (−15 −15 = −30); b: 2nd (+5 +5) then 3rd (−5 −5)
    assert.equal(byId.a.points, 0);
    assert.equal(byId.a.placementBonus, 0);
    assert.equal(byId.b.points, 0);

    const single = mergeImportedGamesIntoLeaderboard(
      [],
      [game([40000, 30000, 20000, 10000], ["a", "b"])],
      options
    );
    assert.deepEqual(
      single.map((e) => [e.playerId, e.points, e.placementBonus]),
      [
        ["a", 30, 15],
        ["b", 10, 5],
      ]
    );
  });

  it("adds no bonus before the season", () => {
    const options = getLeaderboardScoringOptions({ year: 2026, month: 9 });
    const [a] = mergeImportedGamesIntoLeaderboard(
      [],
      [game([40000, 30000, 20000, 10000], ["a"])],
      options
    );
    assert.equal(a.points, 15);
    assert.equal(a.placementBonus, 0);
  });
});
