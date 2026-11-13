/**
 * Prints the most recent Mahjong Soul lookups the import route made (newest
 * first), to check for throttling (error 540) without the hosting logs.
 * Read-only. Needs SUPABASE_SERVICE_ROLE_KEY: the table is not public.
 *
 *   npx tsx --env-file=.env scripts/majsoul-lookups.ts
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { readMajsoulLookups, type MajsoulLookupLogEntry } from "../src/lib/majsoul/lookupLog";

function formatLookup(entry: MajsoulLookupLogEntry): string {
  const when = entry.at.replace("T", " ").replace(/\.\d+Z$/, "Z");
  const outcome = entry.ok
    ? "ok"
    : `FAILED${entry.code !== null ? ` ${entry.code}` : ""} at ${entry.failedAt ?? "?"}`;
  const calls = Object.entries(entry.calls)
    .map(([method, count]) => (count > 1 ? `${method}×${count}` : method))
    .join(", ");
  const lines = [
    `${when}  ${entry.purpose.padEnd(7)}  ${outcome.padEnd(32)}  ${String(entry.durationMs).padStart(6)}ms  ${entry.recordUuid}`,
    `    calls: ${calls || "(none)"}`,
  ];
  // Lookups recorded before version tracking have none of these fields.
  if (entry.clientVersion !== undefined) {
    const accepted = entry.clientVersion
      ? `${entry.clientVersion.string} (resource ${entry.clientVersion.resource}, package ${entry.clientVersion.package})`
      : "none — login never got past oauth2Auth";
    const rejected = entry.rejectedVersions?.length ? entry.rejectedVersions.join(", ") : "none";
    lines.push(`    version: ${accepted}`);
    lines.push(`    rejected: ${rejected}; override: ${entry.versionOverride ?? "not set"}`);
  }
  if (!entry.ok && entry.error) lines.push(`    error: ${entry.error}`);
  return lines.join("\n");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local.example).");
  }
  // supabase-js wants a WebSocket for realtime even though we never use it;
  // Node < 22 has none built in.
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });

  const lookups = await readMajsoulLookups(supabase);
  if (lookups.length === 0) {
    console.log("No Mahjong Soul lookups recorded yet.");
    return;
  }

  for (const entry of lookups) console.log(formatLookup(entry));

  const failed = lookups.filter((entry) => !entry.ok);
  const throttled = failed.filter((entry) => entry.code === 540);
  console.log(
    `\n${lookups.length} lookups: ${lookups.length - failed.length} ok, ${failed.length} failed (${throttled.length} with 540).`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
