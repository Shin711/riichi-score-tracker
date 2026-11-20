import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PLAYER_COMMAND } from "@/lib/discord/commands";
import { commandOptionValue, type Interaction } from "@/lib/discord/interactions";
import {
  autocompletePlayerChoices,
  playerNotFoundMessage,
} from "@/lib/discord/playerCommand";

function command(options: Interaction["data"] extends infer D ? D : never): Interaction {
  return { type: 2, data: { name: "player", ...options } };
}

describe("autocompletePlayerChoices", () => {
  const names = ["Cara", "alice", "Bob", "Dan"];

  it("matches a prefix without caring about case, alphabetically", () => {
    assert.deepEqual(autocompletePlayerChoices(names, "b"), [{ name: "Bob", value: "Bob" }]);
    assert.deepEqual(
      autocompletePlayerChoices(names, "").map((choice) => choice.name),
      ["alice", "Bob", "Cara", "Dan"]
    );
  });

  it("returns at most 25 choices and shortens a very long name", () => {
    const many = Array.from({ length: 30 }, (_, index) => `Player ${String(index).padStart(2, "0")}`);
    assert.equal(autocompletePlayerChoices(many, "").length, 25);
    const long = `${"A".repeat(120)}`;
    assert.equal(autocompletePlayerChoices([long], "a")[0]?.value.length, 100);
  });
});

describe("playerNotFoundMessage", () => {
  it("offers close roster names", () => {
    const message = playerNotFoundMessage("Ali", ["Alice", "Alicia"]);
    assert.match(message, /No player named \*\*Ali\*\*/);
    assert.match(message, /• Alice/);
    assert.match(message, /• Alicia/);
  });
});

describe("command options", () => {
  it("reads the player name", () => {
    const interaction = command({
      options: [{ name: "name", value: "Alice" }],
    });
    assert.equal(commandOptionValue(interaction, "name"), "Alice");
    assert.equal(commandOptionValue(interaction, "missing"), "");
  });
});

describe("PLAYER_COMMAND", () => {
  it("asks for one player and describes monthly stats", () => {
    assert.equal(PLAYER_COMMAND.name, "player");
    assert.equal(PLAYER_COMMAND.options.length, 1);
    assert.equal(PLAYER_COMMAND.options[0]?.name, "name");
    assert.equal(PLAYER_COMMAND.options[0]?.autocomplete, true);
    assert.equal(PLAYER_COMMAND.options[0]?.required, true);
    assert.match(PLAYER_COMMAND.description, /Monthly/i);
  });
});
