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

describe("buildPlayerStatsEmbed", () => {
  it("lists who was fed, who was ron'd, and who was beaten in separate fields", () => {
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
    const embed = buildPlayerStatsEmbed(
      aggregatePlayerRivalry("a", "Alice", games),
      "November 2026"
    );
    assert.equal(embed.description, "🎲 **1** game  ·  ⚡ **1** ron  ·  ✨ **1** tsumo  ·  💥 **1** deal-in");
    assert.deepEqual(embed.fields, [
      {
        name: "💥 Fed the most points to",
        value: "🥇 **Bob** — `48,000` · 1 deal-in",
      },
      {
        name: "🎯 Won the most off",
        value: "🥇 **Bob** — **1** ron · `62,000`",
      },
      {
        name: "🏆 Beat most often",
        value: [
          "🥇 **Bob** — **1/1** game (`100%`)",
          "🥈 **Cara** — **1/1** game (`100%`)",
        ].join("\n"),
      },
    ]);
  });

  it("says when a period has no games and when only the table was recorded", () => {
    const empty = buildPlayerStatsEmbed(rivalry(), "November 2026");
    assert.equal(empty.description, "No games on this month's leaderboard.");
    assert.equal(empty.fields, undefined);
    assert.equal(buildPlayerStatsDescription(rivalry()), "No games on this month's leaderboard.");

    const tableOnly = buildPlayerStatsEmbed(
      rivalry({
        games: 2,
        beat: [{ playerId: "b", displayName: "Bob", games: 2, wins: 2 }],
      }),
      "November 2026"
    );
    assert.equal(tableOnly.fields?.[0]?.value, "*No hand logs for these games.*");
    assert.equal(tableOnly.fields?.[1]?.value, "*No hand logs for these games.*");
    assert.equal(tableOnly.fields?.[2]?.value, "🥇 **Bob** — **2/2** games (`100%`)");
  });

  it("stops each list at five with medals for top three", () => {
    const lines = Array.from({ length: 6 }, (_, index) => ({
      playerId: `p${index}`,
      displayName: `P${index}`,
      count: 6 - index,
      points: 1000 * (6 - index),
    }));
    const embed = buildPlayerStatsEmbed(
      rivalry({ games: 1, gamesWithHands: 1, fed: lines, wonOff: lines }),
      "November 2026"
    );
    const fedValue = embed.fields?.[0]?.value ?? "";
    assert.match(fedValue, /🥇 \*\*P0\*\*/);
    assert.match(fedValue, /🥈 \*\*P1\*\*/);
    assert.match(fedValue, /🥉 \*\*P2\*\*/);
    assert.match(fedValue, /`4` \*\*P3\*\*/);
    assert.match(fedValue, /`5` \*\*P4\*\*/);
    assert.doesNotMatch(fedValue, /\*\*P5\*\*/);
    assert.match(fedValue, /\*…and 1 more\*/);
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
    assert.equal(embed.title, "🀄 Alice · November 2026");
    assert.equal(embed.footer?.text, `${SITE_NAME} · Deal-ins cover 3 of 4 games`);
    assert.equal(response.data.embeds[0]?.footer?.text, embed.footer?.text);
  });
});
