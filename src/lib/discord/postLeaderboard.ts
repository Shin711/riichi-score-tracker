import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import { buildLeaderboardWebhookPayload } from "@/lib/discord/leaderboardMessage";
import {
  deleteWebhookMessage,
  getLeaderboardWebhook,
  postWebhookMessage,
  type DiscordWebhook,
} from "@/lib/discord/webhook";
import { buildCurrentMonthLeaderboard } from "@/lib/leaderboard/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const POSTS_TABLE = "discord_leaderboard_posts";

export type DiscordLeaderboardSyncResult =
  | { status: "posted"; messageId: string; replaced: string | null }
  | { status: "skipped"; reason: string };

export function isDiscordLeaderboardConfigured(): boolean {
  return getLeaderboardWebhook() !== null;
}

async function readLastMessageId(
  supabase: SupabaseClient,
  webhook: DiscordWebhook
): Promise<string | null> {
  const { data, error } = await supabase
    .from(POSTS_TABLE)
    .select("message_id")
    .eq("webhook_id", webhook.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.message_id ?? null;
}

/**
 * Posts the current month's standings to Discord and deletes the previous post,
 * so the channel holds exactly one leaderboard — always the newest message.
 *
 * Posts before deleting: if Discord rejects the new message the old one stays
 * up, which beats leaving the channel with no standings at all.
 */
export async function syncDiscordLeaderboardMessage(
  supabase: SupabaseClient
): Promise<DiscordLeaderboardSyncResult> {
  const webhook = getLeaderboardWebhook();
  if (!webhook) {
    return { status: "skipped", reason: "DISCORD_LEADERBOARD_WEBHOOK_URL is not set." };
  }

  const leaderboard = await buildCurrentMonthLeaderboard(supabase);
  const previousMessageId = await readLastMessageId(supabase, webhook);

  const posted = await postWebhookMessage(
    webhook,
    buildLeaderboardWebhookPayload(leaderboard)
  );

  const { error } = await supabase.from(POSTS_TABLE).upsert(
    {
      webhook_id: webhook.id,
      channel_id: posted.channelId,
      message_id: posted.id,
      posted_at: new Date().toISOString(),
    },
    { onConflict: "webhook_id" }
  );
  if (error) throw new Error(error.message);

  if (previousMessageId && previousMessageId !== posted.id) {
    await deleteWebhookMessage(webhook, previousMessageId);
  }

  return { status: "posted", messageId: posted.id, replaced: previousMessageId };
}

/**
 * Queues a standings refresh to run once the response has been sent, so a slow
 * or broken Discord never delays (or fails) recording a game.
 */
export function refreshDiscordLeaderboardAfterResponse(): void {
  if (!isDiscordLeaderboardConfigured()) return;

  after(async () => {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    try {
      await syncDiscordLeaderboardMessage(supabase);
    } catch (e) {
      console.error("[discord] leaderboard sync failed:", e);
    }
  });
}
