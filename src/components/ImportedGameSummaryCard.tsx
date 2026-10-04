import { isHumanImportEntry, type ImportedGameRow } from "@/lib/imports/types";
import { importedGameResults } from "@/lib/leaderboard/gameResults";
import { formatPointsValue } from "@/lib/leaderboard/points";
import { formatMonthLabel, getMonthPartsInTimezone, LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";

function formatImportPlayedAt(playedAt: string) {
  return new Date(playedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: LEADERBOARD_TIMEZONE,
  });
}

function leaderboardMonthLabel(playedAt: string) {
  const { year, month } = getMonthPartsInTimezone(new Date(playedAt));
  return formatMonthLabel(year, month);
}

function importPointsClassName(delta: number) {
  if (delta > 0) return "text-emerald-700 dark:text-emerald-400";
  if (delta < 0) return "text-red-600 dark:text-red-400";
  return "text-subtle";
}

export function ImportedGameSummaryCard({ row }: { row: ImportedGameRow }) {
  const { usesUma, seats } = importedGameResults(row);
  const ranked = seats.filter(isHumanImportEntry);
  const monthLabel = leaderboardMonthLabel(row.played_at);
  const playedLabel = formatImportPlayedAt(row.played_at);

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-club-ink" suppressHydrationWarning>
            {playedLabel}
          </div>
          <div className="text-xs text-subtle">Counts toward {monthLabel}</div>
        </div>
        {row.mjs_paipu_url ? (
          <a
            href={row.mjs_paipu_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-club-red underline dark:text-red-300"
          >
            MJS log
          </a>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1.5">
        {ranked.map((entry) => (
          <li
            key={entry.player_id ?? entry.display_name}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="min-w-0 truncate text-club-ink">
              <span className="text-subtle tabular-nums">{entry.placement}.</span> {entry.display_name}
            </span>
            <span className="shrink-0 text-right font-mono tabular-nums text-muted">
              {entry.final_score.toLocaleString()}
              <span className={`ml-2 font-semibold ${importPointsClassName(entry.net)}`}>
                {formatPointsValue(entry.net)}
              </span>
              {usesUma && entry.uma !== null ? (
                <span className="block text-[11px] font-normal text-subtle">
                  {formatPointsValue(entry.score)} pts · uma {formatPointsValue(entry.uma, 0)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
