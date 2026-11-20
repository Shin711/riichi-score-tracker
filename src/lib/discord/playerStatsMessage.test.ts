import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlayerStatsDescription,
  buildPlayerStatsEmbed,
  buildPlayerStatsResponse,
} from "@/lib/discord/playerStatsMessage";
import {
  aggregatePlayerRivalry,
  type PlayerRivalry,
  type RivalryGameInput,
} from "@/lib/leaderboard/rivalries";
import { SITE_NAME } from "@/lib/site";

function rivalry(overrides: Partial<PlayerRivalry> = {}): PlayerRivalry {
  return {
    playerId: "a",
    displayName: "Alice",
    games: 0,
    placements: [0, 0, 0, 0],
    avgPlacement: 0,
    highScore: null,
    lowScore: null,
    netPoints: 0,
    bestMatchups: [],
    toughestMatchups: [],
    ...overrides,
  };
}

describe("buildPlayerStatsEmbed", () => {
  it("shows rank, placements, scores, and head-to-head matchups", () => {
    const games: RivalryGameInput[] = [
      {
        standings: [
          { playerId: "a", displayName: "Alice", placement: 1, finalScore: 45000, net: 35 },
          { playerId: "b", displayName: "Bob", placement: 2, finalScore: 28000, net: 8 },
          { playerId: "c", displayName: "Cara", placement: 3, finalScore: 17000, net: -13 },
        ],
      },
      {
        standings: [
          { playerId: "b", displayName: "Bob", placement: 1, finalScore: 39000, net: 29 },
          { playerId: "c", displayName: "Cara", placement: 2, finalScore: 26000, net: 6 },
          { playerId: "a", displayName: "Alice", placement: 4, finalScore: 11000, net: -29 },
        ],
      },
      {
        standings: [
          { playerId: "b", displayName: "Bob", placement: 1, finalScore: 36000, net: 26 },
          { playerId: "a", displayName: "Alice", placement: 2, finalScore: 29000, net: 9 },
          { playerId: "c", displayName: "Cara", placement: 3, finalScore: 20000, net: -10 },
        ],
      },
    ];
    const stats = aggregatePlayerRivalry("a", "Alice", games);
    const embed = buildPlayerStatsEmbed(stats, "November 2026", new Date("2026-11-19T18:00:00Z"), {
      rank: 2,
      rankedCount: 15,
      gamesToRank: 0,
      rating: 15,
    });

    assert.equal(
      embed.description,
      "🏅 **#2** of 15  ·  🎲 **3 games**  ·  📈 **+15.0 pts (`+5.00`/game)**"
    );
    assert.deepEqual(embed.fields, [
      {
        name: "📊 Placements & Scores",
        value: [
          "🟢 **2 wins** (`1st` 1 · `2nd` 1)  ·  🔴 **1 loss** (`3rd` 0 · `4th` 1)",
          "Top 2 `67%`  ·  4th `33%`  ·  Avg `2.33`",
          "🔥 High `45,000`  ·  🥶 Low `11,000`",
        ].join("\n"),
      },
      {
        name: "🏆 Best matchups",
        value: "🥇 **Cara** — **2–1** (`67%`)",
      },
      {
        name: "😈 Toughest matchups",
        value: "🥇 **Bob** — **1–2** (`33%`)",
      },
    ]);
  });

  it("handles zero games and unranked players", () => {
    const empty = buildPlayerStatsEmbed(rivalry(), "November 2026");
    assert.equal(empty.description, "No games on this month's leaderboard.");
    assert.equal(empty.fields, undefined);
    assert.equal(buildPlayerStatsDescription(rivalry()), "No games on this month's leaderboard.");

    const unranked = buildPlayerStatsDescription(
      rivalry({ games: 2, netPoints: -12.5 }),
      { rank: null, rankedCount: 10, gamesToRank: 3, rating: -12.5 }
    );
    assert.equal(unranked, "🎲 **2 games** (3 to rank)  ·  📉 **-12.5 pts (`-6.25`/game)**");
  });

  it("stops each matchup list at five with medals for top three", () => {
    const matchups = Array.from({ length: 6 }, (_, index) => ({
      playerId: `p${index}`,
      displayName: `P${index}`,
      games: 10,
      wins: 9 - index,
      losses: 1 + index,
    }));
    const embed = buildPlayerStatsEmbed(
      rivalry({ games: 10, placements: [4, 3, 2, 1], bestMatchups: matchups }),
      "November 2026"
    );
    const bestValue = embed.fields?.[1]?.value ?? "";
    assert.match(bestValue, /🥇 \*\*P0\*\* — \*\*9–1\*\*/);
    assert.match(bestValue, /🥈 \*\*P1\*\*/);
    assert.match(bestValue, /🥉 \*\*P2\*\*/);
    assert.match(bestValue, /`4` \*\*P3\*\*/);
    assert.match(bestValue, /`5` \*\*P4\*\*/);
    assert.doesNotMatch(bestValue, /\*\*P5\*\*/);
    assert.match(bestValue, /\*…and 1 more\*/);
  });
});

describe("buildPlayerStatsResponse", () => {
  it("replies publicly in the channel with leaderboard footer", () => {
    const response = buildPlayerStatsResponse(
      rivalry({ games: 4, placements: [2, 1, 1, 0], displayName: "Alice" }),
      "November 2026",
      new Date("2026-11-19T18:00:00.000Z")
    );
    assert.equal(response.type, 4);
    assert.equal("flags" in response.data, false);
    assert.deepEqual(response.data.allowed_mentions, { parse: [] });
    assert.equal(response.data.embeds[0]?.title, "🀄 Alice · November 2026");
    assert.equal(
      response.data.embeds[0]?.footer?.text,
      `${SITE_NAME} · Current month's leaderboard`
    );
  });
});
