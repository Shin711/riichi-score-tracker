import type { SupabaseClient } from "@supabase/supabase-js";

import type { MajsoulSessionReport } from "@/lib/majsoul/client";

/**
 * The most recent Mahjong Soul lookups, newest first, kept in one
 * `maintenance_state` row so throttling (540s) can be checked without access
 * to the hosting logs:
 *
 *   select jsonb_pretty(value_json) from maintenance_state where key = 'mjs_recent_lookups';
 *
 * or `npx tsx --env-file=.env scripts/majsoul-lookups.ts`.
 */
export const MJS_LOOKUP_LOG_KEY = "mjs_recent_lookups";
export const MJS_LOOKUP_LOG_LIMIT = 30;

export type MajsoulLookupLogEntry = MajsoulSessionReport & {
  /** The game looked up. */
  recordUuid: string;
  /** "preview" from the import form; "import" for a confirm or one-step import that had to look the game up. */
  purpose: "preview" | "import";
};

/** Prepend `entry` and keep only the newest `MJS_LOOKUP_LOG_LIMIT`. */
export function appendMajsoulLookup(
  existing: unknown,
  entry: MajsoulLookupLogEntry
): MajsoulLookupLogEntry[] {
  const previous = Array.isArray(existing) ? (existing as MajsoulLookupLogEntry[]) : [];
  return [entry, ...previous].slice(0, MJS_LOOKUP_LOG_LIMIT);
}

export async function readMajsoulLookups(
  supabase: SupabaseClient
): Promise<MajsoulLookupLogEntry[]> {
  const { data, error } = await supabase
    .from("maintenance_state")
    .select("value_json")
    .eq("key", MJS_LOOKUP_LOG_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const lookups = (data?.value_json as { lookups?: unknown } | undefined)?.lookups;
  return Array.isArray(lookups) ? (lookups as MajsoulLookupLogEntry[]) : [];
}

/**
 * Best effort: a failure here is logged, never surfaced. Read-then-write, so
 * two lookups finishing at the same instant can drop one entry — fine for a
 * diagnostic list, and lookups are capped at a few a minute anyway.
 */
export async function recordMajsoulLookup(
  supabase: SupabaseClient,
  entry: MajsoulLookupLogEntry
): Promise<void> {
  try {
    const lookups = appendMajsoulLookup(await readMajsoulLookups(supabase), entry);
    const { error } = await supabase.from("maintenance_state").upsert({
      key: MJS_LOOKUP_LOG_KEY,
      value_json: { lookups },
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[majsoul] failed to record lookup:", err);
  }
}
