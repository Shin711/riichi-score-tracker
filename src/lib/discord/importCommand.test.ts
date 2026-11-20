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
import {
  buildDraftMessage,
  buildImportModal,
  draftFromModal,
  draftMatchesLog,
  DraftInputError,
  FIELD_PLAYED_AT,
  formatPlayedAtInput,
  formatSeatLine,
  importControlId,
  isImportControlId,
  parseImportControlId,
  parsePlayedAtInput,
  parseSeatLine,
  seatFieldId,
  type ImportDraft,
} from "@/lib/discord/importDraft";
import {
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type Interaction,
} from "@/lib/discord/interactions";
import type { ImportedGameRow } from "@/lib/imports/types";

const VALID_ID = "230814-90607dc4-3bfd-4241-a1dc-2c639b630db3";
const NOW = new Date("2026-11-20T15:00:00.000Z");

function command(game: string | null, extra: Partial<Interaction> = {}): Interaction {
  return {
    type: InteractionType.ApplicationCommand,
    data: {
      name: IMPORT_COMMAND_NAME,
      options: game === null ? [] : [{ name: IMPORT_GAME_OPTION, type: 3, value: game }],
    },
    member: { user: { id: "42", username: "alice" } },
    ...extra,
  };
}

const draft: ImportDraft = {
  v: 1,
  ownerId: "42",
  seats: [
    { name: "Alice", score: 44000, isAi: false, chombo: 0 },
    { name: "Bob", score: 25400, isAi: false, chombo: 1 },
    { name: "AI", score: 17900, isAi: true, chombo: 0 },
    { name: "Dan", score: 12700, isAi: false, chombo: 0 },
  ],
  playedAt: "2026-11-19T02:41:00.000Z",
  startingPoints: 25000,
  paipuUrl: `https://mahjongsoul.game.yo-star.com/?paipu=${VALID_ID}`,
  lookupUuid: VALID_ID,
  previewToken: null,
  logScores: [44000, 25400, 17900, 12700],
};

describe("/import command", () => {
  it("is registered on the club bot with an optional game option", () => {
    assert.ok(CLUB_COMMANDS.some((cmd) => cmd.name === IMPORT_COMMAND_NAME));
    assert.equal(IMPORT_COMMAND.options[0].name, IMPORT_GAME_OPTION);
    assert.equal(IMPORT_COMMAND.options[0].required, false);
    assert.ok(IMPORT_COMMAND.description.length <= 100);
    assert.ok(IMPORT_COMMAND.options[0].description.length <= 100);
  });

  it("opens a blank entry form when no link is given", async () => {
    const reply = (await handleImportCommand(command(null), "https://club.test")) as {
      type: number;
      data: { custom_id: string; components: unknown[] };
    };
    assert.equal(reply.type, InteractionResponseType.Modal);
    assert.equal(reply.data.custom_id, "imp:modal:new");
    assert.equal(reply.data.components.length, 5);
  });

  it("rejects an unrecognized link privately", async () => {
    const reply = (await handleImportCommand(command("https://example.com/x"), "https://club.test")) as {
      data?: { flags?: number };
    };
    assert.equal(reply.data?.flags, MessageFlags.Ephemeral);
  });

  it("refuses a link when Discord left out the token needed to edit the reply", async () => {
    const reply = (await handleImportCommand(command(VALID_ID), "https://club.test")) as {
      data?: { content?: string; flags?: number };
    };
    assert.equal(reply.data?.flags, MessageFlags.Ephemeral);
    assert.match(reply.data?.content ?? "", /Try again/);
  });
});

describe("import draft controls", () => {
  it("round-trips custom ids and rejects foreign ones", () => {
    const id = "0b5c3d2a-1111-4222-8333-944455556666";
    assert.deepEqual(parseImportControlId(importControlId("save", id)), { action: "save", draftId: id });
    assert.deepEqual(parseImportControlId(importControlId("modal", null)), { action: "modal", draftId: null });
    assert.equal(parseImportControlId("imp:save:new"), null);
    assert.equal(isImportControlId("quiz:answer:123"), false);
    assert.ok(importControlId("cancel", id).length <= 100);
  });
});

describe("seat lines", () => {
  it("reads names, signed and comma'd scores, chombo, and AI seats", () => {
    assert.deepEqual(parseSeatLine("Alice 32000", 0), { name: "Alice", score: 32000, isAi: false, chombo: 0 });
    assert.deepEqual(parseSeatLine("  Mary Jane  −1,200 c2 ", 1), {
      name: "Mary Jane",
      score: -1200,
      isAi: false,
      chombo: 2,
    });
    assert.deepEqual(parseSeatLine("bot 25000", 2), { name: "AI", score: 25000, isAi: true, chombo: 0 });
  });

  it("explains a line it can't read, naming the seat", () => {
    assert.throws(() => parseSeatLine("Alice", 2), (e: Error) => e instanceof DraftInputError && /^West/.test(e.message));
  });

  it("formats lines that parse back to the same seat", () => {
    for (const seat of draft.seats) assert.deepEqual(parseSeatLine(formatSeatLine(seat), 0), seat);
  });
});

describe("game end time", () => {
  it("reads Eastern wall-clock times", () => {
    // Nov 19 9:41pm EST = Nov 20 02:41 UTC
    assert.equal(parsePlayedAtInput("2026-11-19 21:41", "", NOW), "2026-11-20T02:41:00.000Z");
    assert.equal(parsePlayedAtInput("11/19 9:41pm", "", NOW), "2026-11-20T02:41:00.000Z");
    assert.equal(parsePlayedAtInput("11/19/2026 9:41 PM", "", NOW), "2026-11-20T02:41:00.000Z");
  });

  it("keeps the fallback when blank and rejects the future or nonsense", () => {
    assert.equal(parsePlayedAtInput("  ", "keep", NOW), "keep");
    assert.throws(() => parsePlayedAtInput("2026-12-25 10:00", "", NOW), DraftInputError);
    assert.throws(() => parsePlayedAtInput("yesterday", "", NOW), DraftInputError);
  });

  it("formats the edit box value so it parses back", () => {
    const text = formatPlayedAtInput(draft.playedAt);
    assert.equal(parsePlayedAtInput(text, "", NOW), draft.playedAt);
  });
});

describe("draft form", () => {
  const values = {
    [seatFieldId(0)]: "Alice 44000",
    [seatFieldId(1)]: "Bob 25400 c1",
    [seatFieldId(2)]: "AI 17900",
    [seatFieldId(3)]: "Dan 12700",
    [FIELD_PLAYED_AT]: "",
  };

  it("prefills the edit form from the draft", () => {
    const modal = buildImportModal(draft, "abc") as unknown as {
      data: { custom_id: string; components: Array<{ component: { value?: string } }> };
    };
    assert.equal(modal.data.custom_id, "imp:modal:abc");
    assert.equal(modal.data.components[1].component.value, "Bob 25400 c1");
    assert.equal(modal.data.components[4].component.value, formatPlayedAtInput(draft.playedAt));
  });

  it("applies edits, keeping the log only while scores are unchanged", () => {
    const same = draftFromModal(values, draft, NOW);
    assert.equal(draftMatchesLog(same), true);
    assert.equal(same.playedAt, draft.playedAt);

    const renamed = draftFromModal({ ...values, [seatFieldId(3)]: "Danny 12700" }, draft, NOW);
    assert.equal(renamed.seats[3].name, "Danny");
    assert.equal(draftMatchesLog(renamed), true);

    const rescored = draftFromModal({ ...values, [seatFieldId(3)]: "Dan 13700" }, draft, NOW);
    assert.equal(draftMatchesLog(rescored), false);
  });

  it("needs two human seats", () => {
    assert.throws(
      () =>
        draftFromModal(
          { ...values, [seatFieldId(0)]: "AI 1", [seatFieldId(1)]: "AI 2" },
          draft,
          NOW
        ),
      DraftInputError
    );
  });
});

describe("messages", () => {
  it("shows the draft with Save / Edit / Cancel and flags new players", () => {
    const message = buildDraftMessage(draft, "abc", ["Dan"]);
    assert.match(message.content, /Game to import/);
    assert.match(message.content, /Table total 100,000 ✓/);
    assert.match(message.content, /\*\*Dan\*\*/);
    const ids = message.components[0].components.map((button) => button.custom_id);
    assert.deepEqual(ids, ["imp:save:abc", "imp:edit:abc", "imp:cancel:abc"]);
  });

  it("notes when edited scores turn an MJS draft into a manual game", () => {
    const edited = { ...draft, seats: draft.seats.map((s, i) => (i === 0 ? { ...s, score: 45000 } : s)) };
    assert.match(buildDraftMessage(edited, "abc", []).content, /saved as a manual game/);
  });

  it("confirms a save with the table and a link to Import history", () => {
    const row: ImportedGameRow = {
      id: "g1",
      played_at: draft.playedAt,
      starting_points: 25000,
      entries_json: [
        { player_id: "a", display_name: "Alice", final_score: 44000 },
        { player_id: "b", display_name: "Bob", final_score: 25400 },
        { player_id: "c", display_name: "Chiyo", final_score: 17900 },
        { player_id: "d", display_name: "Dan", final_score: 12700 },
      ],
      mjs_paipu_url: null,
      mjs_record_uuid: null,
      created_at: draft.playedAt,
    };
    const message = importSuccessMessage(row, "42");
    assert.match(message, /^\*\*Game imported\*\* by <@42>/);
    assert.match(message, /```[\s\S]*Dan[\s\S]*```/);
    assert.match(message, /\/import>\)/);
    assert.match(importFailureMessage(undefined), /Try again in a minute/);
  });
});
