import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron/auth";
import { maybeAlertStorageUsage } from "@/lib/maintenance/storageAlert";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const EMPTY_SESSION_MAX_AGE_DAYS = 7;

/** Daily cleanup + storage monitoring. Secured with CRON_SECRET on Vercel. */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const [{ data: deleted, error: deleteErr }, { data: sizeBytes, error: sizeErr }] =
      await Promise.all([
        supabase.rpc("delete_empty_stale_sessions", {
          p_older_than_days: EMPTY_SESSION_MAX_AGE_DAYS,
        }),
        supabase.rpc("get_database_size_bytes"),
      ]);

    if (deleteErr) throw new Error(deleteErr.message);
    if (sizeErr) throw new Error(sizeErr.message);

    const storage =
      typeof sizeBytes === "number"
        ? await maybeAlertStorageUsage(supabase, sizeBytes)
        : null;

    return NextResponse.json({
      ok: true,
      deletedEmptySessions: deleted ?? 0,
      emptySessionMaxAgeDays: EMPTY_SESSION_MAX_AGE_DAYS,
      storage,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Maintenance failed" },
      { status: 500 }
    );
  }
}
