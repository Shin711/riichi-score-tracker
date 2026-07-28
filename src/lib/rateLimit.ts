import type { SupabaseClient } from "@supabase/supabase-js";

/** Max new sessions per IP per hour (anonymous creation). */
export const SESSION_CREATE_HOURLY_LIMIT = 10;

/** Max new sessions per IP per day. */
export const SESSION_CREATE_DAILY_LIMIT = 30;

/** Max Mahjong Soul lookups per IP per hour — each one costs a full MJS login. */
export const MJS_IMPORT_HOURLY_LIMIT = 20;

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

export function rateLimitRetryAfterSeconds(reason: "hourly" | "daily"): number {
  return reason === "daily" ? DAY_SECONDS : HOUR_SECONDS;
}
