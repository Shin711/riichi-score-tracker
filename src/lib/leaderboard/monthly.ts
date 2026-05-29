import type { SupabaseClient } from "@supabase/supabase-js";

import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";
import { formatLeaderboardPoints } from "@/lib/leaderboard/points";
import { buildLeaderboardForPeriod } from "@/lib/leaderboard/server";
import {
  formatMonthLabel,
  getMonthPartsInTimezone,
  getMonthPeriodBounds,
} from "@/lib/leaderboard/timezone";

export type MonthlyArchiveEntry = LeaderboardEntry & { rank: number };

export type MonthlyArchive = {
  id: string;
  year: number;
  month: number;
  label: string;
  entries: MonthlyArchiveEntry[];
  gamesCount: number;
  archivedAt: string;
};

export { formatMonthLabel, getMonthPartsInTimezone, getMonthPeriodBounds };

export function* iterateMonthsUntilExclusive(
  endYear: number,
  endMonth: number,
  startYear: number,
  startMonth: number
) {
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month < endMonth)) {
    yield { year, month };
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

function withRanks(entries: LeaderboardEntry[]): MonthlyArchiveEntry[] {
  const active = entries.filter((e) => e.gamesPlayed > 0);
  return active.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function archiveLeaderboardMonth(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<MonthlyArchive | null> {
  const { startIso, endIso } = getMonthPeriodBounds(year, month);
  const { entries, gamesWithPlayers } = await buildLeaderboardForPeriod(supabase, startIso, endIso);
  const ranked = withRanks(entries);

  const { data, error } = await supabase
    .from("leaderboard_monthly_archives")
    .upsert(
      {
        year,
        month,
        entries_json: ranked,
        games_count: gamesWithPlayers,
        archived_at: new Date().toISOString(),
      },
      { onConflict: "year,month" }
    )
    .select("id, year, month, entries_json, games_count, archived_at")
    .single();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return mapArchiveRow(data);
}

export async function ensureMonthlyArchivesUpToDate(supabase: SupabaseClient) {
  const now = new Date();
  const { year: currentYear, month: currentMonth } = getMonthPartsInTimezone(now);

  const { data: earliest, error: earliestErr } = await supabase
    .from("sessions")
    .select("ended_at")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (earliestErr) throw new Error(earliestErr.message);
  if (!earliest?.ended_at) return { archived: 0 };

  const { year: startYear, month: startMonth } = getMonthPartsInTimezone(
    new Date(earliest.ended_at)
  );

  const { data: existing, error: existingErr } = await supabase
    .from("leaderboard_monthly_archives")
    .select("year, month");

  if (existingErr) throw new Error(existingErr.message);

  const existingKeys = new Set((existing ?? []).map((row) => `${row.year}-${row.month}`));
  let archived = 0;

  for (const { year, month } of iterateMonthsUntilExclusive(
    currentYear,
    currentMonth,
    startYear,
    startMonth
  )) {
    if (existingKeys.has(`${year}-${month}`)) continue;
    await archiveLeaderboardMonth(supabase, year, month);
    archived += 1;
  }

  return { archived };
}

export function mapArchiveRow(row: {
  id: string;
  year: number;
  month: number;
  entries_json: MonthlyArchiveEntry[];
  games_count: number;
  archived_at: string;
}): MonthlyArchive {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    label: formatMonthLabel(row.year, row.month),
    entries: row.entries_json ?? [],
    gamesCount: row.games_count,
    archivedAt: row.archived_at,
  };
}

export function archiveToCsv(archive: MonthlyArchive) {
  const lines = ["Rank,Name,Points,Games"];
  for (const entry of archive.entries) {
    const name = entry.displayName.includes(",")
      ? `"${entry.displayName.replace(/"/g, '""')}"`
      : entry.displayName;
    lines.push(
      `${entry.rank},${name},${formatLeaderboardPoints(entry.totalDelta)},${entry.gamesPlayed}`
    );
  }
  return lines.join("\n");
}

export function archiveDownloadFilename(archive: MonthlyArchive, format: "csv" | "json") {
  const ym = `${archive.year}-${String(archive.month).padStart(2, "0")}`;
  return `leaderboard-${ym}.${format}`;
}
