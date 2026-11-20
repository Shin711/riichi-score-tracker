import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregatePlayerRivalry,
  rivalryGameFromImport,
  rivalryGameFromSession,
  type RivalryGameInput,
} from "@/lib/leaderboard/rivalries";
import { defaultRules } from "@/lib/scoring/ledger";

const alice = "a";
const bob = "b";
const cara = "c";
const dan = "d";

function game(
  standings: Array<[string, string, number, number, number]>
): RivalryGameInput {
  return {
    standings: standings.map(([playerId, displayName, placement, finalScore, net]) => ({
      playerId,
      displayName,
      placement,
      finalScore,
      net,
    })),
  };
}

describe("aggregatePlayerRivalry", () => {
  const games: RivalryGameInput[] = [
    game([
      [alice, "Alice", 1, 45000, 35],
      [bob, "Bob", 2, 30000, 10],
      [cara, "Cara", 3, 18000, -12],
      [dan, "Dan", 4, 7000, -33],
    ]),
    game([
      [bob, "Bob", 1, 38000, 28],
      [alice, "Alice", 2, 26000, 6],
      [cara, "Cara", 3, 21000, -9],
    ]),
    game([
      [bob, "Bob", 1, 41000, 31],
      [dan, "Dan", 2, 29000, 9],
      [alice, "Alice", 4, 10000, -30],
    ]),
  ];

  it("summarizes placements, score range, and head-to-head matchups", () => {
    const rivalry = aggregatePlayerRivalry(alice, "Alice", games);
    assert.equal(rivalry.games, 3);
    assert.deepEqual(rivalry.placements, [1, 1, 0, 1]);
    assert.equal(Number(rivalry.avgPlacement.toFixed(2)), 2.33);
    assert.equal(rivalry.highScore, 45000);
    assert.equal(rivalry.lowScore, 10000);
    assert.equal(rivalry.netPoints, 11);

    // Beat Cara 2-0 (+2); split with Dan 1-1 (omitted); lost to Bob 1-2 (-1).
    assert.deepEqual(
      rivalry.bestMatchups.map((m) => [m.displayName, m.wins, m.losses]),
      [["Cara", 2, 0]]
    );
    assert.deepEqual(
      rivalry.toughestMatchups.map((m) => [m.displayName, m.wins, m.losses]),
      [["Bob", 1, 2]]
    );
  });

  it("sorts matchups by net margin first, then wins or losses", () => {
    const rivalry = aggregatePlayerRivalry(alice, "Alice", [
      // Beat Cara 3-1 (+2), beat Dan 2-0 (+2) -> Cara ahead because 3 wins > 2 wins
      game([[alice, "Alice", 1, 40000, 30], [cara, "Cara", 2, 25000, 5], [dan, "Dan", 3, 20000, -10]]),
      game([[alice, "Alice", 1, 40000, 30], [cara, "Cara", 2, 25000, 5], [dan, "Dan", 3, 20000, -10]]),
      game([[alice, "Alice", 1, 40000, 30], [cara, "Cara", 2, 25000, 5]]),
      game([[cara, "Cara", 1, 40000, 30], [alice, "Alice", 2, 25000, 5]]),
    ]);
    assert.deepEqual(
      rivalry.bestMatchups.map((m) => [m.displayName, m.wins, m.losses]),
      [
        ["Cara", 3, 1],
        ["Dan", 2, 0],
      ]
    );
  });

  it("prefers the current roster name over the name stored on the game", () => {
    const rivalry = aggregatePlayerRivalry(alice, "Alice", games, new Map([[bob, "Robert"]]));
    assert.equal(rivalry.toughestMatchups[0]?.displayName, "Robert");
  });
});

describe("rivalryGameFromImport", () => {
  it("keeps AI out of matchups while preserving 1-4 placement and net", () => {
    const imported = rivalryGameFromImport({
      played_at: "2026-11-03T20:00:00Z",
      starting_points: 25000,
      entries_json: [
        { player_id: alice, display_name: "Alice", final_score: 30000 },
        { display_name: "AI", final_score: 40000, is_ai: true },
        { player_id: bob, display_name: "Bob", final_score: 20000 },
        { player_id: cara, display_name: "Cara", final_score: 10000 },
      ],
    });
    assert.deepEqual(
      imported.standings.map((seat) => [seat.displayName, seat.placement, seat.finalScore, seat.net]),
      [
        ["Alice", 2, 30000, 10],
        ["Bob", 3, 20000, -10],
        ["Cara", 4, 10000, -30],
      ]
    );
  });
});

describe("rivalryGameFromSession", () => {
  it("ranks the table with uma and computes final scores from events", () => {
    const sessionGame = rivalryGameFromSession({
      sessionId: "s",
      rules: defaultRules(),
      assignments: [
        { seat: "E", playerId: alice, displayName: "Alice" },
        { seat: "S", playerId: bob, displayName: "Bob" },
        { seat: "W", playerId: cara, displayName: "Cara" },
        { seat: "N", playerId: dan, displayName: "Dan" },
      ],
      events: [
        {
          type: "win",
          created_at: "1",
          payload_json: {
            winType: "ron",
            winner: "S",
            fromSeat: "E",
            deltas: { E: -8000, S: 8000, W: 0, N: 0 },
          },
        },
      ],
    });
    assert.ok(sessionGame);
    assert.deepEqual(
      sessionGame.standings.map((s) => [s.displayName, s.placement, s.finalScore]),
      [
        ["Bob", 1, 33000],
        ["Cara", 2, 25000],
        ["Dan", 3, 25000],
        ["Alice", 4, 17000],
      ]
    );
    const rivalry = aggregatePlayerRivalry(alice, "Alice", [sessionGame]);
    assert.deepEqual(rivalry.placements, [0, 0, 0, 1]);
    assert.equal(rivalry.toughestMatchups.length, 3);
  });
});
