import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildChangeRequestMessage,
  changeRequestCustomId,
  changeRequestOutcomeLine,
  parseChangeRequestCustomId,
  sameGameSnapshot,
  type GameSnapshot,
} from "@/lib/discord/changeRequestMessage";

const REQUEST_ID = "3f2b8c1e-9d4a-4e6b-8a7c-1b2c3d4e5f60";

function snapshot(scores: number[], playedAt = "2026-11-03T20:00:00Z"): GameSnapshot {
  return {
    played_at: playedAt,
    starting_points: 25000,
    mjs_paipu_url: null,
    entries_json: scores.map((final_score, i) => ({
      player_id: `p${i}`,
      display_name: `P${i}`,
      final_score,
    })),
  };
}

describe("change request custom ids", () => {
  it("round-trips approve and reject", () => {
    for (const decision of ["approve", "reject"] as const) {
      assert.deepEqual(parseChangeRequestCustomId(changeRequestCustomId(decision, REQUEST_ID)), {
        decision,
        requestId: REQUEST_ID,
      });
    }
  });

  it("ignores quiz buttons and malformed ids", () => {
    assert.equal(parseChangeRequestCustomId(`quiz:answer:${REQUEST_ID}`), null);
    assert.equal(parseChangeRequestCustomId("gcr:approve:not-a-uuid"), null);
    assert.equal(parseChangeRequestCustomId(`gcr:delete:${REQUEST_ID}`), null);
  });
});

describe("buildChangeRequestMessage", () => {
  it("shows before and after tables with approve and reject buttons for an edit", () => {
    const message = buildChangeRequestMessage({
      requestId: REQUEST_ID,
      kind: "edit",
      before: snapshot([30000, 30000, 20000, 20000]),
      after: { ...snapshot([40000, 20000, 20000, 20000]), starting_points: 25000 },
      requestedBy: "someone@example.com",
    });
    const embed = message.embeds[0];
    assert.match(embed.title, /^Edit requested · game from /);
    assert.match(embed.description, /\*\*Now\*\*[\s\S]*30,000[\s\S]*\*\*After this edit\*\*[\s\S]*40,000/);
    assert.match(embed.footer.text, /someone@example\.com/);

    const buttons = message.components[0].components;
    assert.deepEqual(
      buttons.map((b) => b.custom_id),
      [changeRequestCustomId("approve", REQUEST_ID), changeRequestCustomId("reject", REQUEST_ID)]
    );
  });

  it("describes a removal", () => {
    const message = buildChangeRequestMessage({
      requestId: REQUEST_ID,
      kind: "delete",
      before: snapshot([30000, 30000, 20000, 20000]),
      after: null,
      requestedBy: null,
    });
    assert.match(message.embeds[0].title, /^Removal requested/);
    assert.match(message.embeds[0].description, /would be \*\*removed\*\*/);
    assert.match(message.embeds[0].footer.text, /anonymously/);
    assert.equal(message.components[0].components[0].label, "Approve removal");
  });
});

describe("sameGameSnapshot", () => {
  it("ignores key order and timestamp formatting", () => {
    const a = snapshot([30000, 30000, 20000, 20000], "2026-11-03T20:00:00Z");
    const b: GameSnapshot = {
      mjs_paipu_url: null,
      entries_json: a.entries_json.map((e) => ({
        final_score: e.final_score,
        display_name: e.display_name,
        player_id: e.player_id,
      })),
      starting_points: 25000,
      played_at: "2026-11-03T20:00:00+00:00",
    };
    assert.equal(sameGameSnapshot(a, b), true);
  });

  it("notices a changed score", () => {
    assert.equal(
      sameGameSnapshot(snapshot([30000, 30000, 20000, 20000]), snapshot([30000, 29000, 21000, 20000])),
      false
    );
  });
});

describe("changeRequestOutcomeLine", () => {
  it("credits the approver without pinging them", () => {
    assert.equal(
      changeRequestOutcomeLine("approved", "delete", "123"),
      "✅ Removal approved by <@123>; game removed."
    );
    assert.match(changeRequestOutcomeLine("stale", "edit", null), /changed or was removed/);
  });
});
