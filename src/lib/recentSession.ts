const key = "rst_recentSession";

export type RecentSession = {
  shareId: string;
  title: string;
  visitedAt: string;
};

export function getRecentSession(): RecentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as RecentSession;
  } catch {
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
  window.localStorage.setItem(key, JSON.stringify(entry));
}
