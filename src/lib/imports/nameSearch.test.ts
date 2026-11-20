import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importMatchesNameQuery, normalizeImportNameQuery } from "@/lib/imports/types";

const game = {
  entries_json: [
    { player_id: "a", display_name: "Alice Tanaka", final_score: 40000 },
    { player_id: "b", display_name: "Bob", final_score: 30000 },
    { display_name: "AI Bot", final_score: 20000, is_ai: true },
    { player_id: "c", display_name: "Chiyo", final_score: 10000 },
  ],
};

describe("import history name search", () => {
  it("normalizes case and whitespace", () => {
    assert.equal(normalizeImportNameQuery("  ALICE   tan "), "alice tan");
  });

  it("matches a substring of a human name, case-insensitively", () => {
    assert.equal(importMatchesNameQuery(game, "tanaka"), true);
    assert.equal(importMatchesNameQuery(game, "BO"), true);
    assert.equal(importMatchesNameQuery(game, "alice  tan"), true);
  });

  it("ignores AI seats and non-matching names", () => {
    assert.equal(importMatchesNameQuery(game, "bot"), false);
    assert.equal(importMatchesNameQuery(game, "dave"), false);
  });

  it("treats an empty query as a match", () => {
    assert.equal(importMatchesNameQuery(game, "   "), true);
  });
});
