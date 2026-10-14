import { after } from "next/server";

import { buildGameLogWebhookPayload, type GameLogRow } from "@/lib/discord/gameLogMessage";
import { getGameLogWebhook, postWebhookMessage } from "@/lib/discord/webhook";
import type { MajsoulGameStats } from "@/lib/majsoul/stats";

/**
 * Queues a post of this game to the Discord log channel once the response has
 * been sent, so a slow or broken Discord never delays (or fails) recording it.
 * A no-op when DISCORD_LOG_WEBHOOK_URL is not set.
 */
export function postGameLogAfterResponse(
  row: GameLogRow,
  stats: MajsoulGameStats | null = null
): void {
  const webhook = getGameLogWebhook();
  if (!webhook) return;

  after(async () => {
    try {
      await postWebhookMessage(webhook, buildGameLogWebhookPayload(row, stats));
    } catch (e) {
      console.error("[discord] game log post failed:", e);
    }
  });
}
