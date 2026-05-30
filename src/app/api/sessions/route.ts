import { NextResponse } from "next/server";

import {
  checkSessionCreateRateLimit,
  rateLimitRetryAfterSeconds,
} from "@/lib/rateLimit";
import { randomBase64Url } from "@/lib/ids";
import { getClientIp } from "@/lib/requestIp";
import { defaultRules } from "@/lib/scoring/ledger";
import { DEFAULT_SESSION_TITLE } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const ip = getClientIp(req);
  try {
    const { allowed, reason } = await checkSessionCreateRateLimit(supabase, ip);
    if (!allowed && reason) {
      const retryAfter = rateLimitRetryAfterSeconds(reason);
      return NextResponse.json(
        {
          error:
            reason === "daily"
              ? "Daily session limit reached for this network. Try again tomorrow."
              : "Too many new games created. Please wait and try again.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Rate limit check failed." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  let ownerUserId: string | null = null;
  if (token) {
    const { data: userData } = await supabase.auth.getUser(token);
    ownerUserId = userData.user?.id ?? null;
  }
  const shareId = randomBase64Url(12);
  const editKey = randomBase64Url(18);
  const title = body.title?.trim() || DEFAULT_SESSION_TITLE;
  const rules_json = defaultRules();

  const { data, error } = await supabase
    .from("sessions")
    .insert({ share_id: shareId, title, rules_json, edit_key: editKey, owner_user_id: ownerUserId })
    .select("id, share_id, title, rules_json, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ session: data, editKey });
}
