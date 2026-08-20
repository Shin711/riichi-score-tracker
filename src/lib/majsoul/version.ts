const EN_BASE = "https://mahjongsoul.game.yo-star.com";
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Last known-good Unity productVersion / resource version if live fetch fails. */
const FALLBACK_PRODUCT_VERSION = "4.0.10";
const FALLBACK_RESOURCE_VERSION = "0.11.252.w";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type MajsoulVersionCandidate = {
  string: string;
  resource: string;
  package: string;
};

type CachedVersions = {
  product: string;
  resource: string;
  fetchedAt: number;
};

let cache: CachedVersions | null = null;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": BROWSER_UA, accept: "*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

function parseProductVersion(html: string): string | null {
  return html.match(/productVersion\s*:\s*["']([^"']+)["']/)?.[1] ?? null;
}

function parseResourceVersion(jsonText: string): string | null {
  try {
    const parsed = JSON.parse(jsonText) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version ? parsed.version : null;
  } catch {
    return null;
  }
}

async function loadLiveVersions(): Promise<{ product: string; resource: string }> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { product: cache.product, resource: cache.resource };
  }

  const [htmlResult, versionResult] = await Promise.allSettled([
    fetchText(`${EN_BASE}/`),
    fetchText(`${EN_BASE}/version.json`),
  ]);

  const product =
    (htmlResult.status === "fulfilled" ? parseProductVersion(htmlResult.value) : null) ||
    FALLBACK_PRODUCT_VERSION;
  const resource =
    (versionResult.status === "fulfilled" ? parseResourceVersion(versionResult.value) : null) ||
    FALLBACK_RESOURCE_VERSION;

  cache = { product, resource, fetchedAt: now };
  return { product, resource };
}

/**
 * Mahjong Soul rejects oauth2Auth with code 151 when client_version_string is
 * stale. Routes want Unity `productVersion` (`WebGL_2022-4.0.10`); lobby
 * resource fields want `version.json` (`0.11.252.w`). Try both.
 */
export async function getMajsoulVersionCandidates(
  override?: string
): Promise<MajsoulVersionCandidate[]> {
  const { product, resource } = await loadLiveVersions();
  const resourceBare = resource.replace(/\.w$/, "");
  const forced = override?.trim();

  const seen = new Set<string>();
  const out: MajsoulVersionCandidate[] = [];
  const push = (string: string, res: string) => {
    const key = `${string}|${res}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ string, resource: res, package: product });
  };

  if (forced) {
    push(`WebGL_2022-${forced}`, resource);
    push(`WebGL_2022-${forced}`, forced.endsWith(".w") ? forced : `${forced}.w`);
  }
  push(`WebGL_2022-${product}`, resource);
  push(`WebGL_2022-${product}`, product);
  push(`WebGL_2022-${resourceBare}`, resource);
  push(`web-${resourceBare}`, resource);

  return out;
}
