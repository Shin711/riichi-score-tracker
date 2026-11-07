import type { SupabaseClient } from "@supabase/supabase-js";

import { parseMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { resolveImportPlayers, type ResolveImportOptions } from "@/lib/imports/resolvePlayers";
import { humanImportEntries, importSeatWindLabel } from "@/lib/imports/types";
import type { ImportedGameEntry } from "@/lib/imports/types";

export type ImportBody = {
  playedAt?: string;
  startingPoints?: number;
  mjsPaipuUrl?: string;
  seats?: Array<{
    playerId?: string;
    displayName?: string;
    finalScore?: number;
    isAi?: boolean;
    chombo?: number;
  }>;
};

export type ParsedImportGame = {
  played_at: string;
  starting_points: number;
  entries_json: ImportedGameEntry[];
  mjs_paipu_url: string | null;
  mjs_record_uuid: string | null;
};

export class ImportBodyError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/**
 * Validates a manual game entry (create or edit) and resolves its players.
 * `excludeId` skips that game in the duplicate-log check, for edits.
 */
export async function parseImportBody(
  supabase: SupabaseClient,
  body: ImportBody,
  excludeId?: string,
  resolveOptions: ResolveImportOptions = {}
): Promise<ParsedImportGame> {
  const seats = body.seats ?? [];
  if (seats.length !== 4) {
    throw new ImportBodyError("Provide exactly four player scores.");
  }

  const playedAt = body.playedAt ? new Date(body.playedAt) : new Date();
  if (Number.isNaN(playedAt.getTime())) {
    throw new ImportBodyError("Invalid played-at date.");
  }

  const startingPoints =
    typeof body.startingPoints === "number" && body.startingPoints > 0
      ? Math.round(body.startingPoints)
      : 25000;

  let mjsPaipuUrl: string | null = null;
  let mjsRecordUuid: string | null = null;
  if (body.mjsPaipuUrl?.trim()) {
    const parsed = parseMjsPaipuUrl(body.mjsPaipuUrl);
    if (!parsed) throw new ImportBodyError("Invalid Mahjong Soul log link.");
    mjsPaipuUrl = parsed.paipuUrl;
    mjsRecordUuid = parsed.recordUuid;
  }

  if (mjsRecordUuid) {
    let query = supabase.from("imported_games").select("id").eq("mjs_record_uuid", mjsRecordUuid);
    if (excludeId) query = query.neq("id", excludeId);
    const { data: dupe } = await query.maybeSingle();
    if (dupe) throw new ImportBodyError("This Mahjong Soul log was already imported.", 409);
  }

  const entries = await resolveImportPlayers(
    supabase,
    seats.map((s, index) => ({
      playerId: s.playerId,
      displayName: s.displayName ?? "",
      finalScore: Number(s.finalScore),
      isAi: s.isAi === true,
      windLabel: importSeatWindLabel(index),
      chombo: s.isAi === true || s.chombo === undefined ? 0 : Number(s.chombo),
    })),
    resolveOptions
  );

  const humanSeats = resolveOptions.dryRun
    ? entries.filter((entry) => !entry.is_ai)
    : humanImportEntries({ entries_json: entries });
  if (humanSeats.length < 2) {
    throw new ImportBodyError("At least two human seats are required.");
  }

  return {
    played_at: playedAt.toISOString(),
    starting_points: startingPoints,
    entries_json: entries,
    mjs_paipu_url: mjsPaipuUrl,
    mjs_record_uuid: mjsRecordUuid,
  };
}
