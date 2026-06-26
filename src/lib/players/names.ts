export const DUPLICATE_PLAYER_NAME_MESSAGE =
  "A player with this name already exists (names are unique, case-insensitive).";

export function normalizePlayerDisplayName(name: string): string {
  return name.trim();
}

export function playerNameKey(name: string): string {
  return normalizePlayerDisplayName(name).toLowerCase();
}

export function findPlayerByDisplayName<T extends { id: string; display_name: string }>(
  players: T[],
  name: string
): T | undefined {
  const key = playerNameKey(name);
  return players.find((p) => playerNameKey(p.display_name) === key);
}

export function isDuplicatePlayerNameError(error: { code?: string }): boolean {
  return error.code === "23505";
}
