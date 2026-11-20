import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { buildGameLogTable } from "@/lib/discord/gameLogMessage";
import {
  buildDraftMessage,
  buildImportModal,
  DEFAULT_STARTING_POINTS,
  draftEntries,
  draftFromModal,
  draftMatchesLog,
  DraftInputError,
  formatPlayedAtLabel,
  parseImportControlId,
  type ImportDraft,
} from "@/lib/discord/importDraft";
import {
  commandOptionValue,
  ephemeralReply,
  InteractionResponseType,
  interactionUser,
  modalValues,
  type Interaction,
} from "@/lib/discord/interactions";
import { postGameLogAfterResponse } from "@/lib/discord/postGameLog";
import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { IMPORTED_GAME_COLUMNS } from "@/lib/imports/changeRequests";
import { parseMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { ImportBodyError, parseImportBody } from "@/lib/imports/parseImportBody";
import type { ImportedGameRow } from "@/lib/imports/types";
import { storedHandResults } from "@/lib/leaderboard/handResults";
import { verifyMajsoulPreviewToken } from "@/lib/majsoul/previewToken";
import { findPlayerByDisplayName } from "@/lib/players/names";
import { SITE_URL } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `/import` on the club bot.
 *
 * - `/import game:<log link>` looks the game up on Mahjong Soul and posts it as
 *   a draft.
 * - `/import` with no link opens a form to type the game in, like the site's
 *   manual entry.
 *
 * Either way the draft has Save / Edit / Cancel. Edit reopens the form filled
 * in; Save writes the game to `imported_games` — the same table and checks as
 * the site, so it shows up in the site's Import history.
 *
 * Discord wants every answer within three seconds, and this route must not load
 * the Mahjong Soul client (see the interactions route), so the lookup and the
 * save run after a deferred reply.
 */

const DISCORD_API = "https://discord.com/api/v10";
/** The lookup endpoint allows itself 30s; leave room for its cold start. */
const LOOKUP_TIMEOUT_MS = 45_000;
const DRAFT_KEY_PREFIX = "discord_import_draft:";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export const IMPORT_COMMAND_NAME = "import";
export const IMPORT_GAME_OPTION = "game";

type Reply = Record<string, unknown>;

// ---------------------------------------------------------------- draft store

async function saveDraft(supabase: SupabaseClient, draftId: string, draft: ImportDraft) {
  const { error } = await supabase
    .from("maintenance_state")
    .upsert({ key: DRAFT_KEY_PREFIX + draftId, value_json: draft, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

async function loadDraft(supabase: SupabaseClient, draftId: string): Promise<ImportDraft | null> {
  const { data } = await supabase
    .from("maintenance_state")
    .select("value_json, updated_at")
    .eq("key", DRAFT_KEY_PREFIX + draftId)
    .maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.updated_at as string).getTime() > DRAFT_TTL_MS) return null;
  const draft = data.value_json as ImportDraft;
  return draft?.v === 1 ? draft : null;
}

async function deleteDraft(supabase: SupabaseClient, draftId: string) {
  await supabase.from("maintenance_state").delete().eq("key", DRAFT_KEY_PREFIX + draftId);
}

/** Drafts nobody saved or cancelled; swept whenever a new one is made. */
async function sweepOldDrafts(supabase: SupabaseClient) {
  await supabase
    .from("maintenance_state")
    .delete()
    .like("key", `${DRAFT_KEY_PREFIX}%`)
    .lt("updated_at", new Date(Date.now() - DRAFT_TTL_MS).toISOString());
}

async function newPlayerNames(supabase: SupabaseClient, draft: ImportDraft): Promise<string[]> {
  const { data } = await supabase.from("players").select("id, display_name");
  const roster = (data ?? []) as Array<{ id: string; display_name: string }>;
  return draft.seats
    .filter((seat) => !seat.isAi && !findPlayerByDisplayName(roster, seat.name))
    .map((seat) => seat.name);
}

async function draftMessage(supabase: SupabaseClient, draft: ImportDraft, draftId: string) {
  return buildDraftMessage(draft, draftId, await newPlayerNames(supabase, draft));
}

// ---------------------------------------------------------------- messages

export function importSuccessMessage(row: ImportedGameRow, discordUserId?: string): string {
  const by = discordUserId ? ` by <@${discordUserId}>` : "";
  const lines = [
    `**Game imported**${by} · ${formatPlayedAtLabel(row.played_at)} ET`,
    "```",
    buildGameLogTable(row),
    "```",
  ];
  const links = [`[Import history](<${SITE_URL}/import>)`];
  if (row.mjs_paipu_url) links.unshift(`[Mahjong Soul log](<${row.mjs_paipu_url}>)`);
  lines.push(`${links.join(" · ")} — fix names or scores later with **Edit** there.`);
  return lines.join("\n");
}

export function importFailureMessage(error: string | undefined): string {
  return `Couldn't import that game: ${error?.trim() || "something went wrong. Try again in a minute."}`;
}

async function editOriginal(interaction: Interaction, body: Reply) {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    console.error("[discord] import reply edit failed", res.status, await res.text().catch(() => ""));
  }
}

function lookupOrigin(requestOrigin: string): string {
  // Vercel's per-deployment URLs sit behind deployment protection; the
  // production domain does not. Locally, call the dev server itself.
  return process.env.VERCEL_ENV === "production" ? SITE_URL : requestOrigin;
}

// ---------------------------------------------------------------- /import

type PreviewSeat = {
  nickname: string;
  finalScore: number;
  isAi: boolean;
  suggestedDisplayName: string | null;
};
type PreviewResponse = {
  preview?: {
    paipuUrl: string;
    playedAt: string;
    startingPoints: number;
    seats: PreviewSeat[];
    previewToken?: string | null;
  };
  error?: string;
};

async function lookUpIntoDraft(
  interaction: Interaction,
  origin: string,
  input: string,
  lookupUuid: string,
  ownerId: string
) {
  const supabase = getSupabaseAdmin();
  try {
    const res = await fetch(`${lookupOrigin(origin)}/api/imports/games/mjs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, preview: true }),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as PreviewResponse;
    console.log("[discord] import lookup", { user: ownerId, status: res.status });
    if (!res.ok || !json.preview || !supabase) {
      await editOriginal(interaction, {
        content: importFailureMessage(json.error ?? `the lookup returned HTTP ${res.status}`),
      });
      return;
    }

    const preview = json.preview;
    const draft: ImportDraft = {
      v: 1,
      ownerId,
      seats: preview.seats.map((seat) => ({
        name: seat.isAi ? "AI" : (seat.suggestedDisplayName ?? seat.nickname),
        score: seat.finalScore,
        isAi: seat.isAi,
        chombo: 0,
      })),
      playedAt: preview.playedAt,
      startingPoints: preview.startingPoints,
      paipuUrl: preview.paipuUrl,
      lookupUuid,
      previewToken: preview.previewToken ?? null,
      logScores: preview.seats.map((seat) => seat.finalScore),
    };
    const draftId = crypto.randomUUID();
    await saveDraft(supabase, draftId, draft);
    await editOriginal(interaction, await draftMessage(supabase, draft, draftId));
  } catch (error) {
    console.error("[discord] import lookup failed", error);
    await editOriginal(interaction, {
      content: importFailureMessage(
        error instanceof Error && error.name === "TimeoutError"
          ? "Mahjong Soul took too long to answer. Try again in a minute."
          : undefined
      ),
    });
  }
}

/** `origin` is where this interaction arrived, used for the lookup off production. */
export async function handleImportCommand(interaction: Interaction, origin: string): Promise<Reply> {
  const user = interactionUser(interaction);
  if (!user) return ephemeralReply("Could not tell who ran that.");

  const input = commandOptionValue(interaction, IMPORT_GAME_OPTION).trim();
  if (!input) return buildImportModal(null, null);

  const parsed = parseMjsPaipuUrl(input);
  if (!parsed) {
    return ephemeralReply(
      "That doesn't look like a Mahjong Soul game log link or game ID. Copy it from **Game Log → Share** in the client, or run `/import` with no link to type the game in."
    );
  }
  if (!interaction.application_id || !interaction.token) {
    return ephemeralReply("Discord didn't send what's needed to reply to this import. Try again.");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The database is not configured.");

  const { data: existing } = await supabase
    .from("imported_games")
    .select("id")
    .eq("mjs_record_uuid", parsed.recordUuid)
    .maybeSingle();
  if (existing) return ephemeralReply("This Mahjong Soul game was already imported.");

  after(async () => {
    await sweepOldDrafts(supabase).catch(() => undefined);
    await lookUpIntoDraft(interaction, origin, parsed.paipuUrl, parsed.recordUuid, user.id);
  });
  return { type: InteractionResponseType.DeferredChannelMessageWithSource };
}

// ---------------------------------------------------------------- buttons

async function saveDraftAsGame(
  interaction: Interaction,
  supabase: SupabaseClient,
  draftId: string,
  draft: ImportDraft
) {
  try {
    const keepsLog = draftMatchesLog(draft);
    const stats =
      keepsLog && draft.lookupUuid
        ? (verifyMajsoulPreviewToken(draft.previewToken, draft.lookupUuid)?.stats ?? null)
        : null;

    const game = await parseImportBody(supabase, {
      playedAt: draft.playedAt,
      startingPoints: draft.startingPoints,
      mjsPaipuUrl: draft.paipuUrl ?? undefined,
      seats: draftEntries(draft).map((entry) => ({
        displayName: entry.display_name,
        finalScore: entry.final_score,
        isAi: entry.is_ai,
        chombo: entry.chombo ?? 0,
      })),
    });

    const { data, error } = await supabase
      .from("imported_games")
      .insert({ ...game, hand_results_json: storedHandResults(stats), imported_by_user_id: null })
      .select(IMPORTED_GAME_COLUMNS)
      .single();
    if (error) {
      throw new ImportBodyError(
        error.code === "23505" ? "This Mahjong Soul game was already imported." : error.message
      );
    }

    await deleteDraft(supabase, draftId);
    refreshDiscordLeaderboardAfterResponse();
    postGameLogAfterResponse(data as ImportedGameRow, stats);
    console.log("[discord] import saved", { user: draft.ownerId, game: (data as ImportedGameRow).id });
    await editOriginal(interaction, {
      content: importSuccessMessage(data as ImportedGameRow, draft.ownerId),
      components: [],
    });
  } catch (error) {
    console.error("[discord] import save failed", error);
    // Keep the draft and its buttons so they can fix it and try again.
    const message = await draftMessage(supabase, draft, draftId);
    await editOriginal(interaction, {
      ...message,
      content: `${message.content}\n\n⚠️ ${importFailureMessage(error instanceof Error ? error.message : undefined)}`,
    });
  }
}

export async function handleImportButton(interaction: Interaction): Promise<Reply> {
  const control = parseImportControlId(interaction.data?.custom_id ?? "");
  if (!control || control.action === "modal" || !control.draftId) {
    return ephemeralReply("That button is no longer valid.");
  }
  const user = interactionUser(interaction);
  if (!user) return ephemeralReply("Could not tell who clicked that.");

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The database is not configured.");

  const draft = await loadDraft(supabase, control.draftId);
  if (!draft) {
    return {
      type: InteractionResponseType.UpdateMessage,
      data: {
        content: "This import draft expired. Run `/import` again.",
        components: [],
        allowed_mentions: { parse: [] },
      },
    };
  }
  if (draft.ownerId !== user.id) {
    return ephemeralReply(`Only <@${draft.ownerId}> can change this import. Run \`/import\` to start your own.`);
  }

  if (control.action === "edit") return buildImportModal(draft, control.draftId);

  if (control.action === "cancel") {
    await deleteDraft(supabase, control.draftId);
    return {
      type: InteractionResponseType.UpdateMessage,
      data: { content: "Import cancelled — nothing was saved.", components: [], allowed_mentions: { parse: [] } },
    };
  }

  if (!interaction.application_id || !interaction.token) {
    return ephemeralReply("Discord didn't send what's needed to save this. Try again.");
  }
  const draftId = control.draftId;
  after(() => saveDraftAsGame(interaction, supabase, draftId, draft));
  return { type: InteractionResponseType.DeferredUpdateMessage };
}

// ---------------------------------------------------------------- form

export async function handleImportModalSubmit(interaction: Interaction): Promise<Reply> {
  const control = parseImportControlId(interaction.data?.custom_id ?? "");
  if (!control || control.action !== "modal") return ephemeralReply("That form is no longer valid.");
  const user = interactionUser(interaction);
  if (!user) return ephemeralReply("Could not tell who sent that.");

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The database is not configured.");

  const existing = control.draftId ? await loadDraft(supabase, control.draftId) : null;
  if (control.draftId && !existing) {
    return ephemeralReply("This import draft expired. Run `/import` again.");
  }
  if (existing && existing.ownerId !== user.id) {
    return ephemeralReply(`Only <@${existing.ownerId}> can change this import.`);
  }

  let draft: ImportDraft;
  try {
    draft = draftFromModal(
      modalValues(interaction),
      existing ?? {
        v: 1,
        ownerId: user.id,
        startingPoints: DEFAULT_STARTING_POINTS,
        paipuUrl: null,
        lookupUuid: null,
        previewToken: null,
        logScores: null,
      }
    );
  } catch (error) {
    if (error instanceof DraftInputError) {
      return ephemeralReply(
        `${error.message}\n\nNothing was changed — ${existing ? "press **Edit names / scores** again" : "run `/import` again"}.`
      );
    }
    throw error;
  }

  const draftId = control.draftId ?? crypto.randomUUID();
  if (!control.draftId) after(() => sweepOldDrafts(supabase).catch(() => undefined));
  await saveDraft(supabase, draftId, draft);
  const message = await draftMessage(supabase, draft, draftId);

  // Editing updates the draft message in place; a new form posts a new one.
  return control.draftId
    ? { type: InteractionResponseType.UpdateMessage, data: message }
    : { type: InteractionResponseType.ChannelMessageWithSource, data: message };
}
