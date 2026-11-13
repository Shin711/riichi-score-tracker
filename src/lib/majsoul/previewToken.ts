import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { MajsoulGameSummary, MajsoulSeat } from "@/lib/majsoul/record";
import type { MajsoulGameStats } from "@/lib/majsoul/stats";

/** How long a preview can sit before confirming needs a fresh lookup. */
export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;

type PreviewTokenPayload = {
  v: 1;
  exp: number;
  /** The uuid parsed from the user's input — what the confirm step re-sends. */
  lookupUuid: string;
  recordUuid: string;
  playedAt: string;
  startingPoints: number;
  seats: MajsoulSeat[];
  stats: MajsoulGameStats | null;
};

export type VerifiedPreview = {
  summary: MajsoulGameSummary;
  stats: MajsoulGameStats | null;
};

/**
 * Server-only signing key. A dedicated secret is preferred; otherwise derive
 * one from an existing server secret (rotating it just invalidates open
 * previews, which then fall back to a fresh lookup).
 */
function signingKey(): Buffer | null {
  const secret =
    process.env.MJS_PREVIEW_SECRET?.trim() ||
    process.env.MAJSOUL_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`mjs-preview-token:${secret}`).digest();
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

/**
 * Sign what a preview lookup fetched so the confirm step can reuse it instead
 * of logging into Mahjong Soul a second time. The client can read the token
 * but not alter it, so scores still can't be forged.
 */
export function createMajsoulPreviewToken(
  lookupUuid: string,
  summary: MajsoulGameSummary,
  stats: MajsoulGameStats | null,
  now = Date.now()
): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload: PreviewTokenPayload = {
    v: 1,
    exp: now + PREVIEW_TOKEN_TTL_MS,
    lookupUuid,
    recordUuid: summary.recordUuid,
    playedAt: summary.playedAt.toISOString(),
    startingPoints: summary.startingPoints,
    seats: summary.seats,
    stats,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(key, body)}`;
}

/**
 * Returns the signed preview if `token` is genuine, unexpired and for
 * the game looked up as `lookupUuid`; otherwise null (caller falls back to a fresh lookup).
 */
export function verifyMajsoulPreviewToken(
  token: unknown,
  lookupUuid: string,
  now = Date.now()
): VerifiedPreview | null {
  if (typeof token !== "string") return null;
  const key = signingKey();
  if (!key) return null;

  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(key, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewTokenPayload;
  } catch {
    return null;
  }
  if (payload.v !== 1 || payload.exp < now) return null;
  if (payload.lookupUuid !== lookupUuid) return null;

  return {
    summary: {
      recordUuid: payload.recordUuid,
      playedAt: new Date(payload.playedAt),
      startingPoints: payload.startingPoints,
      seats: payload.seats,
    },
    stats: payload.stats,
  };
}
