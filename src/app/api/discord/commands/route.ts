import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron/auth";
import {
  getBotToken,
  getChannelGuildId,
  getGuildId,
  getPlayerBotToken,
  getQuizChannelId,
} from "@/lib/discord/bot";
import { registerClubCommands, unregisterClubCommands } from "@/lib/discord/commands";

async function resolveClubGuildId(playerToken: string): Promise<string | null> {
  const explicit = getGuildId();
  if (explicit) return explicit;

  const channelId = getQuizChannelId();
  if (!channelId) return null;

  const fromPlayerBot = await getChannelGuildId(channelId, playerToken);
  if (fromPlayerBot) return fromPlayerBot;

  const quizToken = getBotToken();
  return quizToken ? getChannelGuildId(channelId, quizToken) : null;
}

/**
 * Registers `/player` and `/import` on the dedicated club bot (`DISCORD_PLAYER_BOT_TOKEN`),
 * and removes any leftover copies from `DISCORD_BOT_TOKEN` (the quiz bot).
 *
 * Called by hand after deploy:
 *   curl -H "Authorization: Bearer $CRON_SECRET" -X POST …/api/discord/commands
 */
export async function POST(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const playerToken = getPlayerBotToken();
  if (!playerToken) {
    return NextResponse.json(
      {
        error:
          "DISCORD_PLAYER_BOT_TOKEN is not set. Use a separate Discord application so /player does not reply as the quiz bot.",
      },
      { status: 503 }
    );
  }

  try {
    const guildId = await resolveClubGuildId(playerToken);
    if (!guildId) {
      return NextResponse.json(
        {
          error:
            "Set DISCORD_GUILD_ID (or let a configured bot see DISCORD_QUIZ_CHANNEL_ID) so the server can be identified.",
        },
        { status: 502 }
      );
    }

    const { applicationId, commands } = await registerClubCommands(guildId, playerToken);

    const quizToken = getBotToken();
    let removedFromQuizBot = false;
    if (quizToken) {
      removedFromQuizBot = await unregisterClubCommands(guildId, quizToken, applicationId).catch(
        () => false
      );
    }

    return NextResponse.json({ ok: true, guildId, applicationId, commands, removedFromQuizBot });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to register the command." },
      { status: 502 }
    );
  }
}
