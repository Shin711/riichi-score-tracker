export type ImportedGameEntry = {
  player_id?: string;
  display_name: string;
  final_score: number;
  is_ai?: boolean;
};

export type ImportedGameRow = {
  id: string;
  played_at: string;
  starting_points: number;
  entries_json: ImportedGameEntry[];
  mjs_paipu_url: string | null;
  mjs_record_uuid: string | null;
  created_at: string;
};

/** True for human seats that count on the leaderboard (legacy rows without is_ai count as human). */
export function isHumanImportEntry(
  entry: ImportedGameEntry
): entry is ImportedGameEntry & { player_id: string } {
  if (entry.is_ai) return false;
  return !!entry.player_id;
}

export function humanImportEntries(game: Pick<ImportedGameRow, "entries_json">): ImportedGameEntry[] {
  return (game.entries_json ?? []).filter(isHumanImportEntry);
}
