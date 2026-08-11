/** Minimal Discord webhook client: post, edit, delete our own messages. */

const WEBHOOK_URL_PATTERN =
  /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)$/;

const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

export class DiscordWebhookError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DiscordWebhookError";
  }
}

export type DiscordWebhook = {
  /** Snowflake id from the webhook URL — our key for the last-posted message. */
  id: string;
  url: string;
};

export type DiscordMessage = {
  id: string;
  channelId: string | null;
};

/** Discord embed subset we actually send. */
export type DiscordEmbed = {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
};

export type DiscordWebhookPayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  /** Suppresses @everyone/@here/role pings regardless of message text. */
  allowed_mentions?: { parse: string[] };
};

export function parseDiscordWebhookUrl(raw: string): DiscordWebhook | null {
  const trimmed = raw.trim();
  const match = WEBHOOK_URL_PATTERN.exec(trimmed);
  if (!match) return null;
  return { id: match[1], url: trimmed };
}

/** The club standings webhook, or null when the deploy has none configured. */
export function getLeaderboardWebhook(): DiscordWebhook | null {
  const raw = process.env.DISCORD_LEADERBOARD_WEBHOOK_URL;
  if (!raw?.trim()) return null;
  return parseDiscordWebhookUrl(raw);
}

async function discordFetch(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return response;

    // Discord reports the cooldown in seconds; wait it out and retry once or twice.
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    const waitMs = Math.min(
      Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000,
      MAX_RETRY_WAIT_MS
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.text().catch(() => "");
  return body ? `${fallback} (${response.status}): ${body.slice(0, 300)}` : `${fallback} (${response.status})`;
}

/** Posts a new message and returns its id (needed so we can delete it later). */
export async function postWebhookMessage(
  webhook: DiscordWebhook,
  payload: DiscordWebhookPayload
): Promise<DiscordMessage> {
  // `wait=true` makes Discord return the created message instead of 204.
  const response = await discordFetch(`${webhook.url}?wait=true`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload }),
  });

  if (!response.ok) {
    throw new DiscordWebhookError(
      await errorMessage(response, "Discord rejected the leaderboard post"),
      response.status
    );
  }

  const data = (await response.json()) as { id?: string; channel_id?: string };
  if (!data.id) {
    throw new DiscordWebhookError("Discord returned a message without an id.", response.status);
  }

  return { id: data.id, channelId: data.channel_id ?? null };
}

/**
 * Deletes a message this webhook posted. Returns false when it was already gone
 * (someone cleared the channel by hand) — that is not an error worth surfacing.
 */
export async function deleteWebhookMessage(
  webhook: DiscordWebhook,
  messageId: string
): Promise<boolean> {
  const response = await discordFetch(`${webhook.url}/messages/${messageId}`, {
    method: "DELETE",
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new DiscordWebhookError(
      await errorMessage(response, "Discord rejected the delete"),
      response.status
    );
  }
  return true;
}
