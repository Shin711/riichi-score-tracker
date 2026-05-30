import type { SupabaseClient } from "@supabase/supabase-js";

/** Supabase free tier DB size — alert at this threshold (bytes). */
export const STORAGE_ALERT_THRESHOLD_BYTES = 400 * 1024 * 1024;

const ALERT_STATE_KEY = "storage_alert";
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type StorageAlertResult = {
  sizeBytes: number;
  sizeMb: number;
  thresholdMb: number;
  alerted: boolean;
  skippedReason?: "below_threshold" | "cooldown";
};

async function getLastAlertAt(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase
    .from("maintenance_state")
    .select("value_json")
    .eq("key", ALERT_STATE_KEY)
    .maybeSingle();

  const raw = data?.value_json as { lastAlertAt?: string } | null;
  if (!raw?.lastAlertAt) return null;
  const ts = Date.parse(raw.lastAlertAt);
  return Number.isFinite(ts) ? ts : null;
}

async function markAlertSent(supabase: SupabaseClient) {
  await supabase.from("maintenance_state").upsert({
    key: ALERT_STATE_KEY,
    value_json: { lastAlertAt: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
}

async function postWebhook(webhookUrl: string, body: unknown) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Storage alert webhook failed: ${res.status}`);
  }
}

export async function maybeAlertStorageUsage(
  supabase: SupabaseClient,
  sizeBytes: number
): Promise<StorageAlertResult> {
  const sizeMb = Math.round((sizeBytes / (1024 * 1024)) * 10) / 10;
  const thresholdMb = STORAGE_ALERT_THRESHOLD_BYTES / (1024 * 1024);

  if (sizeBytes < STORAGE_ALERT_THRESHOLD_BYTES) {
    return {
      sizeBytes,
      sizeMb,
      thresholdMb,
      alerted: false,
      skippedReason: "below_threshold",
    };
  }

  const lastAlertAt = await getLastAlertAt(supabase);
  if (lastAlertAt !== null && Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) {
    console.warn(
      `[storage] Database at ${sizeMb} MB (>= ${thresholdMb} MB threshold). Alert skipped (cooldown).`
    );
    return {
      sizeBytes,
      sizeMb,
      thresholdMb,
      alerted: false,
      skippedReason: "cooldown",
    };
  }

  const message =
    `Riichi score tracker database is ${sizeMb} MB ` +
    `(threshold: ${thresholdMb} MB). Consider cleanup or upgrading Supabase storage.`;

  console.error(`[storage] ALERT: ${message}`);

  const webhookUrl = process.env.STORAGE_ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    await postWebhook(webhookUrl, {
      content: message,
    });
  }

  await markAlertSent(supabase);

  return { sizeBytes, sizeMb, thresholdMb, alerted: true };
}
