/**
 * Discord HTTP interactions: signature verification and the response shapes.
 *
 * Discord signs every interaction request with Ed25519 and expects a reply
 * within three seconds. Verification is mandatory — Discord itself sends
 * deliberately bad signatures when validating an endpoint, and an endpoint that
 * accepts them is rejected.
 */

const SIGNATURE_HEADER = "x-signature-ed25519";
const TIMESTAMP_HEADER = "x-signature-timestamp";

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ModalSubmit: 5,
} as const;

export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  Modal: 9,
} as const;

export const MessageFlags = {
  /** Only the person who clicked sees the reply. */
  Ephemeral: 64,
} as const;

export const ComponentType = {
  ActionRow: 1,
  Button: 2,
  TextInput: 4,
} as const;

export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
} as const;

export const TextInputStyle = {
  Short: 1,
  Paragraph: 2,
} as const;

export function getApplicationPublicKey(): string | null {
  return process.env.DISCORD_PUBLIC_KEY?.trim() || null;
}

/**
 * Backed by an explicit ArrayBuffer rather than the default `ArrayBufferLike`,
 * which WebCrypto will not accept because it could be a SharedArrayBuffer.
 */
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verifies the Ed25519 signature over `timestamp + rawBody`.
 *
 * Uses WebCrypto directly rather than pulling in tweetnacl — Node has supported
 * Ed25519 here since 18.4, and the Vercel Node runtime is well past that.
 */
export async function verifyInteractionSignature(
  request: Request,
  rawBody: string
): Promise<boolean> {
  const publicKeyHex = getApplicationPublicKey();
  if (!publicKeyHex) return false;

  const signatureHex = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  if (!signatureHex || !timestamp) return false;

  const signature = hexToBytes(signatureHex);
  const publicKey = hexToBytes(publicKeyHex);
  if (!signature || !publicKey) return false;

  try {
    const key = await crypto.subtle.importKey("raw", publicKey, { name: "Ed25519" }, false, [
      "verify",
    ]);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      signature,
      new TextEncoder().encode(timestamp + rawBody)
    );
  } catch {
    // A malformed key or signature is a failed verification, not a crash.
    return false;
  }
}

export type InteractionUser = { id: string; username: string };

export type Interaction = {
  type: number;
  data?: {
    custom_id?: string;
    components?: Array<{
      components?: Array<{ custom_id?: string; value?: string }>;
    }>;
  };
  message?: { id?: string };
  member?: { user?: InteractionUser };
  user?: InteractionUser;
};

/** Guild interactions carry the user under `member`; DMs carry it at the top. */
export function interactionUser(interaction: Interaction): InteractionUser | null {
  return interaction.member?.user ?? interaction.user ?? null;
}

/** Flattens a modal submission into `custom_id -> value`. */
export function modalValues(interaction: Interaction): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of interaction.data?.components ?? []) {
    for (const field of row.components ?? []) {
      if (field.custom_id) values[field.custom_id] = field.value ?? "";
    }
  }
  return values;
}

export function ephemeralReply(content: string) {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral },
  };
}
