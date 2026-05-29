export type ImportedGameEntry = {
  player_id: string;
  display_name: string;
  final_score: number;
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
