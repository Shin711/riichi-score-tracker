import { after } from "next/server";

import { buildGameLogTable } from "@/lib/discord/gameLogMessage";
import {
  commandOptionValue,
  ephemeralReply,
  InteractionResponseType,
  interactionUser,
  type Interaction,
} from "@/lib/discord/interactions";
import { parseMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import type { ImportedGameRow } from "@/lib/imports/types";
import { LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * `/import game:<Mahjong Soul log link or id>` on the club bot.
 *
 * Discord wants an answer within three seconds, and a cold Mahjong Soul login
 * alone takes longer. The interactions route must not load the Mahjong Soul
 * client either (see the note in that route). So this checks the link and
 * looks for a duplicate inline, replies "thinking…", then has the existing
 * `/api/imports/games/mjs` endpoint do the lookup and insert after the reply,
 * and edits the reply with the outcome.
 */

const DISCORD_API = "https://discord.com/api/v10";
/** The import endpoint allows itself 30s; leave room for the cold start. */
const IMPORT_TIMEOUT_MS = 45_000;

export const IMPORT_COMMAND_NAME = "import";
export const IMPORT_GAME_OPTION = "game";

type ImportApiResult = { import?: ImportedGameRow; error?: string };

function formatPlayedAt(playedAt: string): string {
  return new Date(playedAt).toLocaleString("en-US", {
    timeZone: LEADERBOARD_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function importSuccessMessage(row: ImportedGameRow, discordUserId?: string): string {
  const by = discordUserId ? ` by <@${discordUserId}>` : "";
  const lines = [
    `**Game imported**${by} · ${formatPlayedAt(row.played_at)}`,
    "```",
    buildGameLogTable(row),
    "```",
  ];
  if (row.mjs_paipu_url) lines.push(`[Mahjong Soul log](<${row.mjs_paipu_url}>)`);
  return lines.join("\n");
}

export function importFailureMessage(error: string | undefined): string {
  return `Couldn't import that game: ${error?.trim() || "something went wrong. Try again in a minute."}`;
}

async function editOriginalReply(interaction: Interaction, content: string) {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    console.error("[discord] import reply edit failed", res.status, await res.text().catch(() => ""));
  }
}

async function runImport(interaction: Interaction, origin: string, input: string) {
  const userId = interactionUser(interaction)?.id;
  let content: string;
  try {
    const res = await fetch(`${origin}/api/imports/games/mjs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as ImportApiResult;
    content =
      res.ok && json.import
        ? importSuccessMessage(json.import, userId)
        : importFailureMessage(json.error ?? `import endpoint returned ${res.status}`);
    console.log("[discord] import", { user: userId, status: res.status });
  } catch (error) {
    console.error("[discord] import request failed", error);
    content = importFailureMessage(
      error instanceof Error && error.name === "TimeoutError"
        ? "Mahjong Soul took too long to answer. Try again in a minute."
        : undefined
    );
  }
  await editOriginalReply(interaction, content);
}

/**
 * Handles `/import`. `origin` is this deployment's base URL, so the import
 * runs on the same server that received the interaction.
 */
export async function handleImportCommand(interaction: Interaction, origin: string) {
  const input = commandOptionValue(interaction, IMPORT_GAME_OPTION).trim();
  if (!input) {
    return ephemeralReply("Paste a Mahjong Soul game log link or game ID.");
  }

  const parsed = parseMjsPaipuUrl(input);
  if (!parsed) {
    return ephemeralReply(
      "That doesn't look like a Mahjong Soul game log link or game ID. Copy it from **Game Log → Share** in the client."
    );
  }

  if (!interaction.application_id || !interaction.token) {
    return ephemeralReply("Discord didn't send what's needed to reply to this import. Try again.");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The database is not configured.");

  // Cheap, instant answer for the common mistake, before anything is public.
  const { data: existing } = await supabase
    .from("imported_games")
    .select("id")
    .eq("mjs_record_uuid", parsed.recordUuid)
    .maybeSingle();
  if (existing) return ephemeralReply("This Mahjong Soul game was already imported.");

  after(() => runImport(interaction, origin, parsed.paipuUrl));
  return { type: InteractionResponseType.DeferredChannelMessageWithSource };
}
