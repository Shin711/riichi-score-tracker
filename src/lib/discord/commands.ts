import { DiscordBotError, botJson, getBotApplicationId } from "@/lib/discord/bot";

/**
 * `/player` as Discord's command payload.
 *
 * Registration replaces this command in place and keeps every other guild
 * command, so adding a second command later does not wipe this one.
 */
export const PLAYER_COMMAND = {
  name: "player",
  description: "Monthly rank, placements, and matchups for a club player",
  options: [
    {
      type: 3,
      name: "name",
      description: "Club player",
      required: true,
      autocomplete: true,
    },
  ],
} as const;

/**
 * `/import` — a Mahjong Soul log link, or no link to type the game in. Either
 * way it posts a draft to check and edit before saving.
 */
export const IMPORT_COMMAND = {
  name: "import",
  description: "Add a finished game to the club leaderboard (MJS link, or leave blank to type it in)",
  options: [
    {
      type: 3,
      name: "game",
      description: "Mahjong Soul game log link or game ID — leave blank to enter names and scores",
      required: false,
    },
  ],
} as const;

/** Every command the club bot owns; registration replaces exactly these. */
export const CLUB_COMMANDS = [PLAYER_COMMAND, IMPORT_COMMAND] as const;
const CLUB_COMMAND_NAMES = new Set<string>(CLUB_COMMANDS.map((command) => command.name));

type ListedCommand = {
  id?: string;
  name?: string;
  description?: string;
  type?: number;
  options?: unknown[];
};

function keepCommand(command: ListedCommand) {
  if (!command.name || !command.description || CLUB_COMMAND_NAMES.has(command.name)) return null;
  return {
    name: command.name,
    description: command.description,
    ...(command.type ? { type: command.type } : {}),
    ...(command.options ? { options: command.options } : {}),
  };
}

/**
 * Upserts `/player` and `/import` on one guild. Guild commands show up immediately.
 * The bot has to be invited with the `applications.commands` scope.
 */
export async function registerClubCommands(
  guildId: string,
  botToken?: string | null
): Promise<{ applicationId: string; commands: Array<{ id: string; name: string }> }> {
  const applicationId = await getBotApplicationId(botToken);
  const path = `/applications/${applicationId}/guilds/${guildId}/commands`;
  let existing: ListedCommand[];
  try {
    existing = await botJson<ListedCommand[]>(
      path,
      { method: "GET" },
      "Discord rejected the command list",
      botToken
    );
  } catch (error) {
    throw withScopeHint(error);
  }

  const commands = [
    ...(Array.isArray(existing)
      ? existing.flatMap((command) => {
          const kept = keepCommand(command);
          return kept ? [kept] : [];
        })
      : []),
    ...CLUB_COMMANDS,
  ];

  let saved: Array<{ id?: string; name?: string }>;
  try {
    saved = await botJson(
      path,
      { method: "PUT", body: JSON.stringify(commands) },
      "Discord rejected the command update",
      botToken
    );
  } catch (error) {
    throw withScopeHint(error);
  }

  return {
    applicationId,
    commands: saved.flatMap((command) =>
      command.id && command.name ? [{ id: command.id, name: command.name }] : []
    ),
  };
}

/** Drops the club commands from another bot application (e.g. moving off the quiz bot). */
export async function unregisterClubCommands(
  guildId: string,
  botToken: string,
  skipApplicationId?: string
): Promise<boolean> {
  const applicationId = await getBotApplicationId(botToken);
  if (skipApplicationId && applicationId === skipApplicationId) return false;

  const path = `/applications/${applicationId}/guilds/${guildId}/commands`;
  const existing = await botJson<ListedCommand[]>(
    path,
    { method: "GET" },
    "Discord rejected the command list",
    botToken
  );
  if (
    !Array.isArray(existing) ||
    !existing.some((cmd) => cmd.name && CLUB_COMMAND_NAMES.has(cmd.name))
  ) {
    return false;
  }

  const kept = existing.flatMap((command) => {
    const entry = keepCommand(command);
    return entry ? [entry] : [];
  });
  await botJson(
    path,
    { method: "PUT", body: JSON.stringify(kept) },
    "Discord rejected the command removal",
    botToken
  );
  return true;
}

function withScopeHint(error: unknown): Error {
  if (error instanceof DiscordBotError && (error.status === 403 || error.status === 401)) {
    return new DiscordBotError(
      `${error.message} Re-invite the bot with the applications.commands scope.`,
      error.status
    );
  }
  return error instanceof Error ? error : new Error("Failed to register the command.");
}
