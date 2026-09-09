/**
 * Minimal Discord bot REST client.
 *
 * The leaderboard posts through an incoming webhook, but the quiz cannot: plain
 * webhooks may not attach message components, and the quiz needs a button. A
 * bot token also lets us post to a channel by id, which is how the quiz channel
 * is configured.
 */

const API_BASE = "https://discord.com/api/v10";
const REQUEST_TIMEOUT_MS = 10_000;
const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

export class DiscordBotError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DiscordBotError";
  }
}

export function getBotToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || null;
}

export function getQuizChannelId(): string | null {
  return process.env.DISCORD_QUIZ_CHANNEL_ID?.trim() || null;
}

export function isQuizConfigured(): boolean {
  return getBotToken() !== null && getQuizChannelId() !== null;
}

async function botFetch(path: string, init: RequestInit): Promise<Response> {
  const token = getBotToken();
  if (!token) throw new DiscordBotError("DISCORD_BOT_TOKEN is not set.", 503);

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return response;

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
  return body
    ? `${fallback} (${response.status}): ${body.slice(0, 300)}`
    : `${fallback} (${response.status})`;
}

export type DiscordMessagePayload = {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  allowed_mentions?: { parse: string[] };
};

export type PostedMessage = { id: string; channelId: string };

export async function postChannelMessage(
  channelId: string,
  payload: DiscordMessagePayload
): Promise<PostedMessage> {
  const response = await botFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload }),
  });

  if (!response.ok) {
    throw new DiscordBotError(
      await errorMessage(response, "Discord rejected the quiz post"),
      response.status
    );
  }

  const data = (await response.json()) as { id?: string; channel_id?: string };
  if (!data.id) {
    throw new DiscordBotError("Discord returned a message without an id.", response.status);
  }
  return { id: data.id, channelId: data.channel_id ?? channelId };
}

/**
 * Edits a message we posted. Used to strip the Answer button once the hand is
 * revealed, so a stale button can never take a late answer.
 */
export async function editChannelMessage(
  channelId: string,
  messageId: string,
  payload: DiscordMessagePayload
): Promise<boolean> {
  const response = await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new DiscordBotError(
      await errorMessage(response, "Discord rejected the quiz edit"),
      response.status
    );
  }
  return true;
}
