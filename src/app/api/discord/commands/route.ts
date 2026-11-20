import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron/auth";
import { getBotToken, getChannelGuildId, getQuizChannelId } from "@/lib/discord/bot";
import { registerPlayerCommand } from "@/lib/discord/commands";

/**
 * Registers the `/player` slash command in the club server.
 *
 * Called by hand after deploy (the bot token lives on the server, not in chat):
 *   curl -H "Authorization: Bearer $CRON_SECRET" -X POST …/api/discord/commands
 */
export async function POST(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  if (!getBotToken()) {
    return NextResponse.json({ error: "DISCORD_BOT_TOKEN is not set." }, { status: 503 });
  }

  const channelId = getQuizChannelId();
  if (!channelId) {
    return NextResponse.json({ error: "DISCORD_QUIZ_CHANNEL_ID is not set." }, { status: 503 });
  }

  try {
    const guildId = await getChannelGuildId(channelId);
    if (!guildId) {
      return NextResponse.json(
        {
          error:
            "The bot cannot see the quiz channel, so it cannot tell which server to register in.",
        },
        { status: 502 }
      );
    }

    const commands = await registerPlayerCommand(guildId);
    return NextResponse.json({ ok: true, guildId, commands });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to register the command." },
      { status: 502 }
    );
  }
}
