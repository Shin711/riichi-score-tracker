import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportedGameEntry } from "@/lib/imports/types";
import {
  DUPLICATE_PLAYER_NAME_MESSAGE,
  findPlayerByDisplayName,
  isDuplicatePlayerNameError,
  normalizePlayerDisplayName,
  playerNameKey,
} from "@/lib/players/names";

export type ImportSeatInput = {
  playerId?: string;
  displayName?: string;
  finalScore: number;
  isAi?: boolean;
  windLabel?: string;
};

export async function resolveImportPlayers(
  supabase: SupabaseClient,
  seats: ImportSeatInput[]
): Promise<ImportedGameEntry[]> {
  const { data: existing, error } = await supabase.from("players").select("id, display_name");
  if (error) throw new Error(error.message);

  const byId = new Map((existing ?? []).map((p) => [p.id, p.display_name]));
  const byNameLower = new Map(
    (existing ?? []).map((p) => [playerNameKey(p.display_name), p])
  );

  const resolved: ImportedGameEntry[] = [];
  const humanPlayerIds: string[] = [];

  for (const seat of seats) {
    if (!Number.isFinite(seat.finalScore)) {
      throw new Error(
        seat.isAi
          ? `Final score is required for AI (${seat.windLabel ?? "seat"}).`
          : "Final score is required for each human seat."
      );
    }

    if (seat.isAi) {
      const wind = seat.windLabel?.trim() || "Seat";
      resolved.push({
        display_name: `AI (${wind})`,
        final_score: Math.round(seat.finalScore),
        is_ai: true,
      });
      continue;
    }

    const name = normalizePlayerDisplayName(seat.displayName ?? "");
    if (!name) {
      throw new Error("Each human seat needs a player name.");
    }

    let playerId = seat.playerId?.trim();
    if (playerId && !byId.has(playerId)) {
      throw new Error(`Unknown player id for ${name}.`);
    }

    if (!playerId) {
      const match = byNameLower.get(playerNameKey(name));
      if (match) {
        playerId = match.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("players")
          .insert({ display_name: name })
          .select("id, display_name")
          .single();

        if (createErr) {
          if (isDuplicatePlayerNameError(createErr)) {
            const { data: retryPlayers, error: retryErr } = await supabase
              .from("players")
              .select("id, display_name");
            if (retryErr) throw new Error(retryErr.message);
            const retryMatch = findPlayerByDisplayName(retryPlayers ?? [], name);
            if (!retryMatch) throw new Error(DUPLICATE_PLAYER_NAME_MESSAGE);
            playerId = retryMatch.id;
            byId.set(playerId, retryMatch.display_name);
            byNameLower.set(playerNameKey(retryMatch.display_name), retryMatch);
          } else {
            throw new Error(createErr.message);
          }
        } else {
          playerId = created.id;
          byId.set(playerId, created.display_name);
          byNameLower.set(playerNameKey(created.display_name), created);
        }
      }
    }

    const displayName = byId.get(playerId!) ?? name;
    humanPlayerIds.push(playerId!);
    resolved.push({
      player_id: playerId!,
      display_name: displayName,
      final_score: Math.round(seat.finalScore),
      is_ai: false,
    });
  }

  if (humanPlayerIds.length === 0) {
    throw new Error("At least one human seat is required.");
  }

  if (new Set(humanPlayerIds).size !== humanPlayerIds.length) {
    throw new Error("Each player can only appear once per game.");
  }

  return resolved;
}
