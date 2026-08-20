const PAIPU_HOSTS = [
  "mahjongsoul.game.yo-star.com",
  "game.maj-soul.com",
  "game.mahjongsoul.com",
  "mahjongsoul.tournament.yo-star.com",
];

const CANONICAL_PAIPU_BASE = "https://mahjongsoul.game.yo-star.com/?paipu=";

/** `230814-90607dc4-3bfd-4241-a1dc-2c639b630db3` — YYMMDD prefix plus a uuid4. */
const RECORD_UUID_RE = /^[0-9]{6}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Trailing `_a<accountId>` and optional `_<seat>` that share links append. */
const PAIPU_SUFFIX_RE = /_a\d+(?:_\d)?$/;

/** In-game copy: `Mahjong Soul Game Log:https://…?paipu=…` */
const CLIPBOARD_LABEL_RE = /^(?:mahjong\s*soul\s*(?:game\s*)?log)\s*:\s*/i;

const OBFUSCATION_CODEX = "0123456789abcdefghijklmnopqrstuvwxyz";

export type ParsedPaipu = {
  recordUuid: string;
  paipuUrl: string;
};

/**
 * Share links copied from the game client encode the uuid with a
 * position-dependent shift. Hex-only ids are already plain.
 *
 * Port of `parse_majsoul_link` in Longhorn-Riichi/InjusticeJudge.
 */
function deobfuscateRecordId(identifier: string): string {
  if (/^[0-9a-f-]+$/.test(identifier)) return identifier;

  let decoded = "";
  for (let i = 0; i < identifier.length; i += 1) {
    const char = identifier[i];
    if (char === "-") {
      decoded += "-";
      continue;
    }
    const index = OBFUSCATION_CODEX.indexOf(char);
    if (index === -1) return identifier; // not an id we recognize; let validation reject it
    decoded += OBFUSCATION_CODEX[(index - i + 55) % 36];
  }
  return decoded;
}

/** Strip the `_a…` share suffix and decode, without validating. */
function normalizeRecordId(raw: string): string | null {
  const trimmed = raw.trim().replace(PAIPU_SUFFIX_RE, "");
  if (!trimmed) return null;
  const decoded = deobfuscateRecordId(trimmed).toLowerCase();
  return RECORD_UUID_RE.test(decoded) ? decoded : null;
}

function canonicalPaipuUrl(recordUuid: string): string {
  return `${CANONICAL_PAIPU_BASE}${recordUuid}`;
}

/** Pull a URL or id out of the in-game clipboard label (and similar prefixes). */
function extractPaipuCandidate(input: string): string {
  let trimmed = input.trim().replace(CLIPBOARD_LABEL_RE, "").trim();
  const urlMatch = trimmed.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[),.;"'>\]]+$/, "");
  }
  return trimmed;
}

/**
 * Parse a Mahjong Soul game reference into a stable record id.
 *
 * Accepts a full/partial share link on any known host, a bare game id
 * (plain or obfuscated), or the in-game clipboard string
 * `Mahjong Soul Game Log:https://…?paipu=…`. Always returns the canonical
 * yo-star log URL so dedupe on `mjs_record_uuid` stays consistent.
 */
export function parseMjsPaipuUrl(input: string): ParsedPaipu | null {
  const trimmed = extractPaipuCandidate(input);
  if (!trimmed) return null;

  // Bare game id (no scheme, no query) — the common copy/paste from chat.
  if (!trimmed.includes("/") && !trimmed.includes("?")) {
    const recordUuid = normalizeRecordId(trimmed);
    return recordUuid ? { recordUuid, paipuUrl: canonicalPaipuUrl(recordUuid) } : null;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    if (!PAIPU_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return null;
    }

    // Newer clients put `?paipu=` after the hash (…/#/?paipu=…).
    const paipu =
      url.searchParams.get("paipu") ??
      new URLSearchParams(url.hash.replace(/^#\/?\??/, "")).get("paipu");
    if (!paipu) return null;

    const recordUuid = normalizeRecordId(paipu);
    if (!recordUuid) return null;

    return { recordUuid, paipuUrl: canonicalPaipuUrl(recordUuid) };
  } catch {
    return null;
  }
}

export function isValidMjsPaipuUrl(input: string): boolean {
  return parseMjsPaipuUrl(input) !== null;
}
