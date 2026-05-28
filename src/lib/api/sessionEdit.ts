import type { SupabaseClient } from "@supabase/supabase-js";

import { SESSION_ENDED_MESSAGE } from "@/lib/session/status";

type SessionEditRow = {
  id: string;
  edit_key: string;
  ended_at: string | null;
};

export async function getSessionForEdit(
  supabase: SupabaseClient,
  shareId: string,
  editKey: string,
  options?: { allowEnded?: boolean }
) {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, edit_key, ended_at")
    .eq("share_id", shareId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 400 as const };
  }
  if (!session) {
    return { error: "Session not found.", status: 404 as const };
  }
  const row = session as SessionEditRow;
  if (row.edit_key !== editKey) {
    return { error: "Invalid edit key.", status: 403 as const };
  }
  if (!options?.allowEnded && row.ended_at) {
    return { error: SESSION_ENDED_MESSAGE, status: 409 as const };
  }

  return { session: row };
}
