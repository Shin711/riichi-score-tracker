import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportSeatInput = {
  playerId?: string;
  displayName: string;
  finalScore: number;
};

export async function resolveImportPlayers(
  supabase: SupabaseClient,
  seats: ImportSeatInput[]
) {
  const { data: existing, error } = await supabase.from("players").select("id, display_name");
  if (error) throw new Error(error.message);

  const byId = new Map((existing ?? []).map((p) => [p.id, p.display_name]));
  const byNameLower = new Map(
    (existing ?? []).map((p) => [p.display_name.trim().toLowerCase(), p])
  );

  const resolved: Array<{ player_id: string; display_name: string; final_score: number }> = [];

  for (const seat of seats) {
    const name = seat.displayName.trim();
    if (!name) {
      throw new Error("Each seat needs a player name.");
    }
    if (!Number.isFinite(seat.finalScore)) {
      throw new Error(`Final score is required for ${name}.`);
    }

    let playerId = seat.playerId?.trim();
    if (playerId && !byId.has(playerId)) {
      throw new Error(`Unknown player id for ${name}.`);
    }

    if (!playerId) {
      const match = byNameLower.get(name.toLowerCase());
      if (match) {
        playerId = match.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("players")
          .insert({ display_name: name })
          .select("id, display_name")
          .single();
        if (createErr) throw new Error(createErr.message);
        playerId = created.id;
        byId.set(playerId, created.display_name);
        byNameLower.set(name.toLowerCase(), created);
      }
    }

    const displayName = byId.get(playerId!) ?? name;
    resolved.push({
      player_id: playerId!,
      display_name: displayName,
      final_score: Math.round(seat.finalScore),
    });
  }

  const ids = resolved.map((r) => r.player_id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Each player can only appear once per game.");
  }

  return resolved;
}
