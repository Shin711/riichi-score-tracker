import type { SupabaseClient } from "@supabase/supabase-js";

/** Max new sessions per IP per hour (anonymous creation). */
export const SESSION_CREATE_HOURLY_LIMIT = 10;

/** Max new sessions per IP per day. */
export const SESSION_CREATE_DAILY_LIMIT = 30;

/** Max Mahjong Soul lookups per IP per hour — each one costs a full MJS login. */
export const MJS_IMPORT_HOURLY_LIMIT = 20;

/** Max edit/removal requests per IP per hour — each one posts to the approval channel. */
export const GAME_CHANGE_REQUEST_HOURLY_LIMIT = 10;

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86400;

async function withinLimit(
  supabase: SupabaseClient,
  key: string,
  windowSeconds: number,
  maxCount: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_count: maxCount,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function checkSessionCreateRateLimit(
  supabase: SupabaseClient,
  ip: string
): Promise<{ allowed: boolean; reason?: "hourly" | "daily" }> {
  const base = `session_create:${ip}`;

  const dailyOk = await withinLimit(supabase, `${base}:day`, DAY_SECONDS, SESSION_CREATE_DAILY_LIMIT);
  if (!dailyOk) return { allowed: false, reason: "daily" };

  const hourlyOk = await withinLimit(
    supabase,
    `${base}:hour`,
    HOUR_SECONDS,
    SESSION_CREATE_HOURLY_LIMIT
  );
  if (!hourlyOk) return { allowed: false, reason: "hourly" };

  return { allowed: true };
}

export async function checkMajsoulImportRateLimit(
  supabase: SupabaseClient,
  ip: string
): Promise<{ allowed: boolean; reason?: "hourly" }> {
  const ok = await withinLimit(
    supabase,
    `mjs_import:${ip}:hour`,
    HOUR_SECONDS,
    MJS_IMPORT_HOURLY_LIMIT
  );
  return ok ? { allowed: true } : { allowed: false, reason: "hourly" };
}

/**
 * Account-wide caps on Mahjong Soul lookups, across every IP. The per-IP limit
 * above doesn't protect the single shared import account: several people
 * importing at once all land on it. Each lookup is a full login + one
 * fetchGameRecord.
 */
export const MJS_ACCOUNT_MINUTE_LIMIT = 4;
export const MJS_ACCOUNT_HOURLY_LIMIT = 40;

export async function checkMajsoulAccountRateLimit(
  supabase: SupabaseClient
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const minuteOk = await withinLimit(supabase, "mjs_account:minute", 60, MJS_ACCOUNT_MINUTE_LIMIT);
  if (!minuteOk) return { allowed: false, retryAfterSeconds: 60 };
  const hourOk = await withinLimit(
    supabase,
    "mjs_account:hour",
    HOUR_SECONDS,
    MJS_ACCOUNT_HOURLY_LIMIT
  );
  if (!hourOk) return { allowed: false, retryAfterSeconds: HOUR_SECONDS };
  return { allowed: true };
}

const MJS_COOLDOWN_KEY = "mjs_cooldown";
/** How long to stop calling Mahjong Soul after it throttles us (error 540). */
export const MJS_COOLDOWN_SECONDS = 15 * 60;

/**
 * Seconds left on a Mahjong Soul cooldown, or 0 if lookups may proceed.
 * Retrying into a 540 only extends the throttle, so we back off entirely.
 */
export async function getMajsoulCooldownSeconds(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("maintenance_state")
    .select("value_json")
    .eq("key", MJS_COOLDOWN_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const until = Date.parse((data?.value_json as { until?: string } | undefined)?.until ?? "");
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export async function startMajsoulCooldown(supabase: SupabaseClient, code: number): Promise<void> {
  const until = new Date(Date.now() + MJS_COOLDOWN_SECONDS * 1000).toISOString();
  const { error } = await supabase.from("maintenance_state").upsert({
    key: MJS_COOLDOWN_KEY,
    value_json: { until, code },
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[majsoul] failed to record cooldown:", error.message);
}

export async function checkGameChangeRequestRateLimit(
  supabase: SupabaseClient,
  ip: string
): Promise<boolean> {
  return withinLimit(
    supabase,
    `game_change_request:${ip}:hour`,
    HOUR_SECONDS,
    GAME_CHANGE_REQUEST_HOURLY_LIMIT
  );
}

export function rateLimitRetryAfterSeconds(reason: "hourly" | "daily"): number {
  return reason === "daily" ? DAY_SECONDS : HOUR_SECONDS;
}
