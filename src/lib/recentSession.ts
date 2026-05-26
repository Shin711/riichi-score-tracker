const key = "rst_recentSession";

export type RecentSession = {
  shareId: string;
  title: string;
  visitedAt: string;
};

let cachedRaw: string | null | undefined;
let cachedValue: RecentSession | null = null;

export function getRecentSession(): RecentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === cachedRaw) {
      return cachedValue;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedValue = null;
      return null;
    }
    cachedValue = JSON.parse(raw) as RecentSession;
    return cachedValue;
  } catch {
    cachedRaw = null;
    cachedValue = null;
    return null;
  }
}

export function storeRecentSession(shareId: string, title: string) {
  if (typeof window === "undefined") return;
  const entry: RecentSession = {
    shareId,
    title,
    visitedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(entry);
  window.localStorage.setItem(key, serialized);
  cachedRaw = serialized;
  cachedValue = entry;
}
