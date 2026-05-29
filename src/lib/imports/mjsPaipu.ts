const PAIPU_HOSTS = [
  "mahjongsoul.game.yo-star.com",
  "game.maj-soul.com",
  "game.mahjongsoul.com",
];

export type ParsedPaipu = {
  recordUuid: string;
  paipuUrl: string;
};

/** Parse Mahjong Soul log link into a stable record id for deduplication. */
export function parseMjsPaipuUrl(input: string): ParsedPaipu | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");
    if (!PAIPU_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      return null;
    }

    const paipu = url.searchParams.get("paipu");
    if (!paipu) return null;

    const recordUuid = paipu.split("_")[0]?.trim();
    if (!recordUuid || recordUuid.length < 10) return null;

    return {
      recordUuid,
      paipuUrl: url.toString(),
    };
  } catch {
    return null;
  }
}

export function isValidMjsPaipuUrl(input: string): boolean {
  return parseMjsPaipuUrl(input) !== null;
}
