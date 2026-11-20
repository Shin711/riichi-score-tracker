import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlayerStatsDescription,
  buildPlayerStatsEmbed,
  buildPlayerStatsResponse,
} from "@/lib/discord/playerStatsMessage";
import { aggregatePlayerRivalry } from "@/lib/leaderboard/rivalries";
import type { PlayerRivalry, RivalryGameInput } from "@/lib/leaderboard/rivalries";
import { SITE_NAME } from "@/lib/site";

function rivalry(overrides: Partial<PlayerRivalry> = {}): PlayerRivalry {
  return {
    playerId: "a",
    displayName: "Alice",
    games: 0,
    ron: 0,
    tsumo: 0,
    dealIns: 0,
    gamesWithHands: 0,
    fed: [],
    wonOff: [],
    beat: [],
    ...overrides,
  };
}

describe("buildPlayerStatsDescription", () => {
  it("lists who was fed, who was ron'd, and who was beaten", () => {
    const games: RivalryGameInput[] = [
      {
        standings: [
          { playerId: "a", displayName: "Alice", placement: 1 },
          { playerId: "b", displayName: "Bob", placement: 2 },
          { playerId: "c", displayName: "Cara", placement: 3 },
        ],
        hands: [
          { winnerId: "b", dealInId: "a", tsumo: false, points: 48000 },
          { winnerId: "a", dealInId: "b", tsumo: false, points: 62000 },
          { winnerId: "a", dealInId: null, tsumo: true, points: 8000 },
        ],
      },
    ];
    const description = buildPlayerStatsDescription(aggregatePlayerRivalry("a", "Alice", games));
    assert.equal(
      description,
      [
        "1 game · 1 ron · 1 tsumo · 1 deal-in",
        "",
        "**Fed the most points to**",
        "1. **Bob** — 48,000 over 1 deal-in",
        "",
        "**Won the most off**",
        "1. **Bob** — 1 ron, 62,000",
        "",
        "**Beat most often**",
        "**Bob** — 1 of 1 game",
        "**Cara** — 1 of 1 game",
      ].join("\n")
    );
  });

  it("says when a period has no games and when only the table was recorded", () => {
    assert.equal(buildPlayerStatsDescription(rivalry()), "No games in this period.");
    const description = buildPlayerStatsDescription(
      rivalry({
        games: 2,
        beat: [{ playerId: "b", displayName: "Bob", games: 2, wins: 2 }],
      })
    );
    assert.match(description, /No hand logs for these games\./);
    assert.match(description, /\*\*Bob\*\* — 2 of 2 games/);
  });

  it("stops each list at five", () => {
    const lines = Array.from({ length: 6 }, (_, index) => ({
      playerId: `p${index}`,
      displayName: `P${index}`,
      count: 6 - index,
      points: 1000 * (6 - index),
    }));
    const description = buildPlayerStatsDescription(
      rivalry({ games: 1, gamesWithHands: 1, fed: lines, wonOff: lines })
    );
    assert.match(description, /5\. \*\*P4\*\*/);
    assert.doesNotMatch(description, /\*\*P5\*\*/);
    assert.match(description, /…and 1 more/);
  });
});

describe("buildPlayerStatsResponse", () => {
  it("replies in the channel, with deal-in coverage in the footer", () => {
    const response = buildPlayerStatsResponse(
      rivalry({ games: 4, gamesWithHands: 3, displayName: "Alice" }),
      "November 2026",
      new Date("2026-11-19T18:00:00.000Z")
    );
    assert.equal(response.type, 4);
    assert.equal("flags" in response.data, false);
    assert.deepEqual(response.data.allowed_mentions, { parse: [] });
    const embed = buildPlayerStatsEmbed(
      rivalry({ games: 4, gamesWithHands: 3, displayName: "Alice" }),
      "November 2026",
      new Date("2026-11-19T18:00:00.000Z")
    );
    assert.equal(embed.title, "Alice · November 2026");
    assert.equal(embed.footer?.text, `${SITE_NAME} · Deal-ins cover 3 of 4 games`);
    assert.equal(response.data.embeds[0]?.footer?.text, embed.footer?.text);
  });
});
