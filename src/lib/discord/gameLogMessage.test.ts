import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGameLogTable,
  buildGameLogWebhookPayload,
  type GameLogRow,
} from "@/lib/discord/gameLogMessage";
import type { MajsoulGameStats } from "@/lib/majsoul/stats";

const PAIPU_URL = "https://mahjongsoul.game.yo-star.com/?paipu=261003-90607dc4-3bfd-4241-a1dc-2c639b630db3";

function game(playedAt: string, mjsPaipuUrl: string | null = null): GameLogRow {
  return {
    played_at: playedAt,
    starting_points: 25000,
    mjs_paipu_url: mjsPaipuUrl,
    entries_json: [
      { player_id: "a", display_name: "Alan", final_score: 20000 },
      { player_id: "b", display_name: "Bea", final_score: 45000 },
      { display_name: "AI (West)", final_score: 10000, is_ai: true },
      { player_id: "d", display_name: "A very long club name", final_score: 25000 },
    ],
  };
}

const STATS: MajsoulGameStats = {
  hands: 9,
  draws: 1,
  seats: [
    { seat: 0, wins: 1, tsumo: 0, dealIns: 2, riichi: 3, calls: 1 },
    { seat: 1, wins: 4, tsumo: 2, dealIns: 0, riichi: 2, calls: 0 },
    { seat: 2, wins: 0, tsumo: 0, dealIns: 1, riichi: 0, calls: 5 },
    { seat: 3, wins: 2, tsumo: 1, dealIns: 1, riichi: 1, calls: 2 },
  ],
  biggestHand: { seat: 1, points: 12000, han: 6, fu: 30, yakuman: false, tsumo: false, dealInSeat: 0 },
};

describe("buildGameLogTable", () => {
  it("lists seats in placement order with uma and net from October 2026", () => {
    assert.equal(
      buildGameLogTable(game("2026-10-03T20:00:00Z")),
      [
        "#  Player           Score  Uma    Net",
        "1  Bea             45,000  +15  +35.0",
        "2  A very long c…  25,000   +5   +5.0",
        "3  Alan            20,000   -5  -10.0",
        "4  AI (West)       10,000  -15  -30.0",
      ].join("\n")
    );
  });

  it("drops the uma column for games before the season", () => {
    const table = buildGameLogTable(game("2026-09-03T20:00:00Z"));
    assert.equal(table.split("\n")[0], "#  Player           Score    Net");
    assert.match(table, /1  Bea             45,000  \+20\.0/);
  });
});

describe("buildGameLogWebhookPayload", () => {
  it("titles the post with the Eastern play time and links the site for manual games", () => {
    const embed = buildGameLogWebhookPayload(game("2026-10-03T20:05:00Z")).embeds![0];
    assert.equal(embed.title, "Game · Sat, Oct 3, 4:05 PM EDT");
    assert.match(embed.url!, /\/import$/);
    assert.match(embed.footer!.text, /manual entry$/);
    assert.equal(embed.timestamp, "2026-10-03T20:05:00.000Z");
    assert.equal(embed.fields, undefined);
  });

  it("links the log and adds stats for Mahjong Soul games", () => {
    const embed = buildGameLogWebhookPayload(game("2026-10-03T20:05:00Z", PAIPU_URL), STATS).embeds![0];
    assert.equal(embed.url, PAIPU_URL);
    assert.match(embed.footer!.text, /Mahjong Soul log$/);
    assert.deepEqual(embed.fields, [
      {
        name: "Mahjong Soul stats",
        value: [
          "**Bea** — 4 wins (2 tsumo) · 0 deal-ins · 2 riichi · 0 calls",
          "**A very long club name** — 2 wins (1 tsumo) · 1 deal-in · 1 riichi · 2 calls",
          "**Alan** — 1 win · 2 deal-ins · 3 riichi · 1 call",
          "**AI (West)** — 0 wins · 1 deal-in · 0 riichi · 5 calls",
          "Biggest hand: **Bea** — 12,000 (Haneman, 6 han 30 fu), ron off Alan",
          "9 hands · 1 draw",
        ].join("\n"),
      },
    ]);
  });

  it("names yakuman and tsumo in the biggest hand", () => {
    const embed = buildGameLogWebhookPayload(game("2026-10-03T20:05:00Z", PAIPU_URL), {
      ...STATS,
      biggestHand: { seat: 3, points: 32000, han: 1, fu: 30, yakuman: true, tsumo: true, dealInSeat: null },
    }).embeds![0];
    assert.match(
      embed.fields![0].value,
      /Biggest hand: \*\*A very long club name\*\* — 32,000 \(Yakuman\), tsumo/
    );
  });
});
