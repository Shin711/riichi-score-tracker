import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLUB_COMMANDS, IMPORT_COMMAND } from "@/lib/discord/commands";
import {
  handleImportCommand,
  importFailureMessage,
  importSuccessMessage,
  IMPORT_COMMAND_NAME,
  IMPORT_GAME_OPTION,
} from "@/lib/discord/importCommand";
import { InteractionType, MessageFlags, type Interaction } from "@/lib/discord/interactions";
import type { ImportedGameRow } from "@/lib/imports/types";

const VALID_ID = "230814-90607dc4-3bfd-4241-a1dc-2c639b630db3";

function command(game: string, extra: Partial<Interaction> = {}): Interaction {
  return {
    type: InteractionType.ApplicationCommand,
    data: { name: IMPORT_COMMAND_NAME, options: [{ name: IMPORT_GAME_OPTION, type: 3, value: game }] },
    member: { user: { id: "42", username: "alice" } },
    ...extra,
  };
}

const row: ImportedGameRow = {
  id: "g1",
  played_at: "2026-11-19T23:41:00.000Z",
  starting_points: 25000,
  entries_json: [
    { player_id: "a", display_name: "Alice", final_score: 44000 },
    { player_id: "b", display_name: "Bob", final_score: 25400 },
    { player_id: "c", display_name: "Chiyo", final_score: 17900 },
    { player_id: "d", display_name: "Dan", final_score: 12700 },
  ],
  mjs_paipu_url: `https://mahjongsoul.game.yo-star.com/?paipu=${VALID_ID}`,
  mjs_record_uuid: VALID_ID,
  created_at: "2026-11-19T23:45:00.000Z",
};

describe("/import command", () => {
  it("is registered on the club bot with a required game option", () => {
    assert.ok(CLUB_COMMANDS.some((cmd) => cmd.name === IMPORT_COMMAND_NAME));
    assert.equal(IMPORT_COMMAND.options[0].name, IMPORT_GAME_OPTION);
    assert.equal(IMPORT_COMMAND.options[0].required, true);
  });

  it("rejects an empty or unrecognized link privately, before deferring", async () => {
    for (const input of ["", "   ", "https://example.com/not-a-log"]) {
      const reply = (await handleImportCommand(command(input), "https://club.test")) as {
        data?: { flags?: number };
      };
      assert.equal(reply.data?.flags, MessageFlags.Ephemeral, input);
    }
  });

  it("refuses when Discord left out the token needed to edit the reply", async () => {
    const reply = (await handleImportCommand(command(VALID_ID), "https://club.test")) as {
      data?: { content?: string; flags?: number };
    };
    assert.equal(reply.data?.flags, MessageFlags.Ephemeral);
    assert.match(reply.data?.content ?? "", /Try again/);
  });

  it("formats a success with the standings table, importer, and log link", () => {
    const message = importSuccessMessage(row, "42");
    assert.match(message, /^\*\*Game imported\*\* by <@42> · /);
    assert.match(message, /Alice/);
    assert.match(message, /```[\s\S]*Dan[\s\S]*```/);
    assert.ok(message.includes(`(<${row.mjs_paipu_url}>)`));
  });

  it("explains failures, with a fallback when the endpoint gave no reason", () => {
    assert.equal(
      importFailureMessage("This Mahjong Soul game was already imported."),
      "Couldn't import that game: This Mahjong Soul game was already imported."
    );
    assert.match(importFailureMessage(undefined), /Try again in a minute/);
  });
});
