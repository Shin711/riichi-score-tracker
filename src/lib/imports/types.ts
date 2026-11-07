export const IMPORT_SEAT_WIND_LABELS = ["East", "South", "West", "North"] as const;

export function importSeatWindLabel(seatIndex: number): string {
  return IMPORT_SEAT_WIND_LABELS[seatIndex] ?? `Seat ${seatIndex + 1}`;
}

export type ImportedGameEntry = {
  player_id?: string;
  display_name: string;
  final_score: number;
  is_ai?: boolean;
  /** Chombo called on this player; each moves 15 pts from them, 5 to every other seat. */
  chombo?: number;
};

/** Chombo count for a seat (0 for AI seats and rows recorded before chombo existed). */
export function importEntryChombo(entry: Pick<ImportedGameEntry, "chombo" | "is_ai">): number {
  if (entry.is_ai) return 0;
  const count = entry.chombo ?? 0;
  return Number.isInteger(count) && count > 0 ? count : 0;
}

export type ImportedGameRow = {
  id: string;
  played_at: string;
  starting_points: number;
  entries_json: ImportedGameEntry[];
  mjs_paipu_url: string | null;
  mjs_record_uuid: string | null;
  created_at: string;
  imported_by_user_id?: string | null;
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
