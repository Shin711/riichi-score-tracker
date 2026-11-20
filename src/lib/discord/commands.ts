import { DiscordBotError, botJson, getBotApplicationId } from "@/lib/discord/bot";

/**
 * `/player` as Discord's command payload.
 *
 * Registration replaces this command in place and keeps every other guild
 * command, so adding a second command later does not wipe this one.
 */
export const PLAYER_COMMAND = {
  name: "player",
  description: "Who a player rons, deals into, and beats",
  options: [
    {
      type: 3,
      name: "name",
      description: "Club player",
      required: true,
      autocomplete: true,
    },
    {
      type: 3,
      name: "period",
      description: "Which games to count",
      required: false,
      choices: [
        { name: "This month", value: "month" },
        { name: "All time", value: "all" },
      ],
    },
  ],
} as const;

type ListedCommand = {
  name?: string;
  description?: string;
  type?: number;
  options?: unknown[];
};

function keepCommand(command: ListedCommand) {
  if (!command.name || !command.description || command.name === PLAYER_COMMAND.name) return null;
  return {
    name: command.name,
    description: command.description,
    ...(command.type ? { type: command.type } : {}),
    ...(command.options ? { options: command.options } : {}),
  };
}

/**
 * Upserts `/player` on one guild. Guild commands show up immediately.
 * The bot has to be invited with the `applications.commands` scope.
 */
export async function registerPlayerCommand(
  guildId: string
): Promise<Array<{ id: string; name: string }>> {
  const applicationId = await getBotApplicationId();
  const path = `/applications/${applicationId}/guilds/${guildId}/commands`;
  let existing: ListedCommand[];
  try {
    existing = await botJson<ListedCommand[]>(path, { method: "GET" }, "Discord rejected the command list");
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
    PLAYER_COMMAND,
  ];

  let saved: Array<{ id?: string; name?: string }>;
  try {
    saved = await botJson(path, { method: "PUT", body: JSON.stringify(commands) }, "Discord rejected the command update");
  } catch (error) {
    throw withScopeHint(error);
  }

  return saved.flatMap((command) =>
    command.id && command.name ? [{ id: command.id, name: command.name }] : []
  );
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
