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
        // Multipart bodies carry a generated boundary in their content-type, so
        // fetch has to set that header itself — forcing JSON here would corrupt
        // every attachment upload.
        ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
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

export type MessageAttachment = { filename: string; data: Buffer };

/**
 * Builds the multipart body Discord wants for attachments: the message goes in
 * a `payload_json` part, each file in a `files[n]` part. An embed refers to a
 * file as `attachment://<filename>`.
 */
function attachmentBody(
  payload: DiscordMessagePayload,
  files: MessageAttachment[]
): FormData {
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      allowed_mentions: { parse: [] },
      ...payload,
      attachments: files.map((file, index) => ({ id: index, filename: file.filename })),
    })
  );
  files.forEach((file, index) => {
    form.append(
      `files[${index}]`,
      new Blob([new Uint8Array(file.data)], { type: "image/png" }),
      file.filename
    );
  });
  return form;
}

export async function postChannelMessage(
  channelId: string,
  payload: DiscordMessagePayload,
  files: MessageAttachment[] = []
): Promise<PostedMessage> {
  const init: RequestInit =
    files.length > 0
      ? { method: "POST", body: attachmentBody(payload, files) }
      : {
          method: "POST",
          body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload }),
        };

  const response = await botFetch(`/channels/${channelId}/messages`, init);

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

/** The guild a channel belongs to, or null if the bot cannot see the channel. */
export async function getChannelGuildId(channelId: string): Promise<string | null> {
  const response = await botFetch(`/channels/${channelId}`, { method: "GET" });
  if (!response.ok) return null;
  const data = (await response.json()) as { guild_id?: string };
  return data.guild_id ?? null;
}

export type GuildEmoji = { id: string; name: string };

/** Custom emoji uploaded to a guild. Used for the tile art. */
export async function getGuildEmojis(guildId: string): Promise<GuildEmoji[]> {
  const response = await botFetch(`/guilds/${guildId}/emojis`, { method: "GET" });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{ id?: string; name?: string }>;
  return data.flatMap((entry) =>
    entry.id && entry.name ? [{ id: entry.id, name: entry.name }] : []
  );
}

/** Removes a message we posted. */
export async function deleteChannelMessage(
  channelId: string,
  messageId: string
): Promise<boolean> {
  const response = await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new DiscordBotError(
      await errorMessage(response, "Discord rejected the delete"),
      response.status
    );
  }
  return true;
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
