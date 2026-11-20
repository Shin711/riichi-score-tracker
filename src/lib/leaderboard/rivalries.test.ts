import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregatePlayerRivalry, rivalryGameFromImport, rivalryGameFromSession } from "@/lib/leaderboard/rivalries";
import type { RivalryGameInput } from "@/lib/leaderboard/rivalries";
import { defaultRules } from "@/lib/scoring/ledger";

const alice = "a";
const bob = "b";
const cara = "c";
const dan = "d";

function game(
  standings: Array<[string, string, number]>,
  hands?: RivalryGameInput["hands"]
): RivalryGameInput {
  return {
    standings: standings.map(([playerId, displayName, placement]) => ({
      playerId,
      displayName,
      placement,
    })),
    ...(hands ? { hands } : {}),
  };
}

describe("aggregatePlayerRivalry", () => {
  const games: RivalryGameInput[] = [
    game(
      [
        [alice, "Alice", 1],
        [bob, "Bob", 2],
        [cara, "Cara", 3],
        [dan, "Dan", 4],
      ],
      [
        { winnerId: alice, dealInId: bob, tsumo: false, points: 8000 },
        { winnerId: alice, dealInId: bob, tsumo: false, points: 4000 },
        { winnerId: bob, dealInId: alice, tsumo: false, points: 12000 },
        { winnerId: alice, dealInId: null, tsumo: true, points: 6000 },
      ]
    ),
    game(
      [
        [bob, "Bob", 1],
        [alice, "Alice", 2],
      ],
      [
        { winnerId: alice, dealInId: bob, tsumo: false, points: 2000 },
        { winnerId: bob, dealInId: alice, tsumo: false, points: 1000 },
      ]
    ),
    game([
      [alice, "Alice", 1],
      [cara, "Cara", 2],
      [bob, "Bob", 4],
    ]),
  ];

  it("counts rons, deal-ins, and who finished ahead", () => {
    const rivalry = aggregatePlayerRivalry(alice, "Alice", games);
    assert.equal(rivalry.games, 3);
    assert.equal(rivalry.ron, 3);
    assert.equal(rivalry.tsumo, 1);
    assert.equal(rivalry.dealIns, 2);
    assert.equal(rivalry.gamesWithHands, 2);
    assert.deepEqual(rivalry.fed, [{ playerId: bob, displayName: "Bob", count: 2, points: 13000 }]);
    assert.deepEqual(rivalry.wonOff, [{ playerId: bob, displayName: "Bob", count: 3, points: 14000 }]);
    assert.deepEqual(
      rivalry.beat.map((line) => [line.displayName, line.wins, line.games]),
      [
        ["Bob", 2, 3],
        ["Cara", 2, 2],
        ["Dan", 1, 1],
      ]
    );
  });

  it("counts hands against AI on the player, not as an opponent", () => {
    const rivalry = aggregatePlayerRivalry(alice, "Alice", [
      game(
        [
          [alice, "Alice", 1],
          [bob, "Bob", 2],
        ],
        [
          { winnerId: null, dealInId: alice, tsumo: false, points: 8000 },
          { winnerId: alice, dealInId: null, tsumo: false, points: 5200 },
        ]
      ),
    ]);
    assert.equal(rivalry.ron, 1);
    assert.equal(rivalry.dealIns, 1);
    assert.deepEqual(rivalry.fed, []);
    assert.deepEqual(rivalry.wonOff, []);
    assert.equal(rivalry.beat[0]?.displayName, "Bob");
  });

  it("prefers the current roster name over the name stored on the game", () => {
    const rivalry = aggregatePlayerRivalry(alice, "Alice", games, new Map([[bob, "Robert"]]));
    assert.equal(rivalry.fed[0]?.displayName, "Robert");
    assert.equal(rivalry.beat[0]?.displayName, "Robert");
  });
});

describe("rivalryGameFromImport", () => {
  const row = {
    played_at: "2026-11-03T20:00:00Z",
    starting_points: 25000,
    entries_json: [
      { player_id: alice, display_name: "Alice", final_score: 30000 },
      { display_name: "AI", final_score: 40000, is_ai: true },
      { player_id: bob, display_name: "Bob", final_score: 20000 },
      { player_id: cara, display_name: "Cara", final_score: 10000 },
    ],
    hand_results_json: [{ winnerSeat: 0, dealInSeat: 2, points: 8000 }],
  };

  it("keeps AI out of the standings and maps seats onto players", () => {
    const game = rivalryGameFromImport(row);
    assert.deepEqual(
      game.standings.map((seat) => [seat.displayName, seat.placement]),
      [
        ["Alice", 2],
        ["Bob", 3],
        ["Cara", 4],
      ]
    );
    assert.deepEqual(game.hands, [
      { winnerId: alice, dealInId: bob, tsumo: false, points: 8000 },
    ]);
  });

  it("leaves hands off when the log was never read", () => {
    const game = rivalryGameFromImport({ ...row, hand_results_json: null });
    assert.equal(game.hands, undefined);
  });
});

describe("rivalryGameFromSession", () => {
  it("reads a ron off the winner and the discarder, and ranks the table", () => {
    const game = rivalryGameFromSession({
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
    assert.ok(game);
    assert.equal(game.standings[0]?.playerId, bob);
    assert.equal(game.standings.at(-1)?.playerId, alice);
    assert.deepEqual(game.hands, [
      { winnerId: bob, dealInId: alice, tsumo: false, points: 8000 },
    ]);

    const rivalry = aggregatePlayerRivalry(alice, "Alice", [game]);
    assert.deepEqual(rivalry.fed, [{ playerId: bob, displayName: "Bob", count: 1, points: 8000 }]);
    assert.equal(rivalry.gamesWithHands, 1);
    assert.deepEqual(rivalry.beat, []);
  });

  it("infers a ron from the deltas when the win type was not stored", () => {
    const game = rivalryGameFromSession({
      sessionId: "s",
      rules: defaultRules(),
      assignments: [
        { seat: "E", playerId: alice, displayName: "Alice" },
        { seat: "S", playerId: bob, displayName: "Bob" },
      ],
      events: [
        {
          type: "win",
          created_at: "1",
          payload_json: { deltas: { E: 3900, S: -3900, W: 0, N: 0 } },
        },
      ],
    });
    assert.deepEqual(game?.hands, [
      { winnerId: alice, dealInId: bob, tsumo: false, points: 3900 },
    ]);
  });
});
