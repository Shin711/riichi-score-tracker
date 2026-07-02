"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";
import type { MonthlyArchive } from "@/lib/leaderboard/monthly";
import { formatLeaderboardPoints, formatLeaderboardAverage, formatLeaderboardRating } from "@/lib/leaderboard/points";
import {
  gamesUntilLeaderboardRank,
  getLeaderboardScoringOptions,
  LEADERBOARD_MIN_GAMES_FOR_RANK_LEGACY,
  splitLeaderboardEntries,
  type LeaderboardScoringPeriod,
} from "@/lib/leaderboard/qualification";

function pointsClassName(points: number) {
  if (points > 0) return "text-emerald-700 dark:text-emerald-400";
  if (points < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function formatHeadlineScore(entry: LeaderboardEntry, useRating: boolean) {
  return useRating
    ? formatLeaderboardRating(entry.points, entry.gamesPlayed)
    : formatLeaderboardPoints(entry.totalDelta);
}

function formatRatingSecondary(entry: LeaderboardEntry) {
  return `Avg ${formatLeaderboardAverage(entry.points, entry.gamesPlayed)}/game · Net ${formatLeaderboardPoints(entry.totalDelta)}`;
}

function LeaderboardTable({
  entries,
  emptyMessage,
  startRank = 0,
  useRating,
}: {
  entries: LeaderboardEntry[];
  emptyMessage: string;
  startRank?: number;
  useRating: boolean;
}) {
  if (entries.length === 0) {
    return <div className="px-4 py-8 text-sm text-muted">{emptyMessage}</div>;
  }

  return (
    <ul className="divide-y divide-club-border">
      {entries.map((entry, i) => {
        const index = startRank + i;
        const rank = index + 1;
        const isPositive = entry.points > 0;
        const badgeClass =
          index === 0
            ? "rank-badge-1"
            : index === 1
              ? "rank-badge-2"
              : index === 2
                ? "rank-badge-3"
                : isPositive
                  ? "rank-badge-pos"
                  : entry.points < 0
                    ? "rank-badge-neg"
                    : "rank-badge-n";
        return (
          <li
            key={entry.playerId}
            className={`lb-row ${isPositive ? "lb-row--pos" : ""} px-4 py-4 sm:grid sm:grid-cols-[2.5rem_1fr_6rem_5rem] sm:items-center sm:gap-3 sm:py-3`}
          >
            <div className="flex items-center gap-3 sm:contents">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${badgeClass}`}
              >
                {rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-club-ink">{entry.displayName}</div>
                {useRating ? (
                  <div className="mt-1 text-xs text-subtle">
                    {formatRatingSecondary(entry)}
                    <span className="sm:hidden">
                      {" "}
                      · {entry.gamesPlayed} game{entry.gamesPlayed === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-subtle sm:hidden">
                    {entry.gamesPlayed} game{entry.gamesPlayed === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              <div
                className={`lb-points ml-auto font-mono text-lg font-semibold tabular-nums sm:ml-0 sm:text-right sm:text-base ${pointsClassName(entry.points)}`}
              >
                {formatHeadlineScore(entry, useRating)}
              </div>
            </div>
            <div className="hidden text-right text-sm tabular-nums text-subtle sm:block">
              {entry.gamesPlayed}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Podium({
  entries,
  useRating,
}: {
  entries: LeaderboardEntry[];
  useRating: boolean;
}) {
  if (entries.length === 0) return null;

  const tiers = [
    { tone: "podium-1", label: "1st", suffix: "Champion" },
    { tone: "podium-2", label: "2nd", suffix: "Runner-up" },
    { tone: "podium-3", label: "3rd", suffix: "Third" },
  ];

  return (
    <div className="podium grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
      {entries.slice(0, 3).map((entry, i) => {
        const tier = tiers[i];
        return (
          <div key={entry.playerId} className={`podium-card ${tier.tone}`}>
            <div className="podium-rank" aria-hidden>
              {tier.label}
            </div>
            <div className="podium-name">{entry.displayName}</div>
            <div className={`podium-score ${entry.points > 0 ? "podium-score-pos" : entry.points < 0 ? "podium-score-neg" : ""}`}>
              {formatHeadlineScore(entry, useRating)}
            </div>
            <div className="podium-meta">
              {useRating ? `${formatRatingSecondary(entry)} · ` : ""}
              {entry.gamesPlayed} game{entry.gamesPlayed === 1 ? "" : "s"} · {tier.suffix}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UnrankedLeaderboardList({
  entries,
  minGamesForRank,
  useRating,
}: {
  entries: LeaderboardEntry[];
  minGamesForRank: number;
  useRating: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <ul className="divide-y divide-club-border">
      {entries.map((entry) => {
        const needed = gamesUntilLeaderboardRank(entry.gamesPlayed, minGamesForRank);
        return (
          <li
            key={entry.playerId}
            className="px-4 py-4 sm:grid sm:grid-cols-[1fr_6rem_5rem] sm:items-center sm:gap-3 sm:py-3"
          >
            <div className="flex items-center gap-3 sm:contents">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-club-ink">{entry.displayName}</div>
                <div className="mt-1 text-xs text-subtle">
                  {useRating ? `${formatRatingSecondary(entry)} · ` : ""}
                  {needed} more game{needed === 1 ? "" : "s"} to rank · {entry.gamesPlayed} played
                </div>
              </div>
              <div
                className={`ml-auto font-mono text-lg font-semibold tabular-nums sm:ml-0 sm:text-right sm:text-base ${pointsClassName(entry.points)}`}
              >
                {formatHeadlineScore(entry, useRating)}
              </div>
            </div>
            <div className="hidden text-right text-sm tabular-nums text-subtle sm:block">
              {entry.gamesPlayed}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LeaderboardSections({
  entries,
  period,
  minGamesForRank,
  useRating,
  rankedEmptyMessage,
  showPodium = false,
}: {
  entries: LeaderboardEntry[];
  period: LeaderboardScoringPeriod;
  minGamesForRank: number;
  useRating: boolean;
  rankedEmptyMessage: string;
  showPodium?: boolean;
}) {
  const { ranked, unranked } = useMemo(
    () => splitLeaderboardEntries(entries, period),
    [entries, period]
  );

  return (
    <>
      {showPodium && ranked.length > 0 ? (
        <Podium entries={ranked} useRating={useRating} />
      ) : null}
      {showPodium && ranked.length > 3 ? (
        <div className="border-t border-club-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-subtle sm:grid sm:grid-cols-[2.5rem_1fr_6rem_5rem] sm:gap-3">
          <span>Rank</span>
          <span>Name</span>
          <span className="text-right">{useRating ? "Rating" : "Points"}</span>
          <span className="text-right">Games</span>
        </div>
      ) : null}
      <LeaderboardTable
        entries={showPodium ? ranked.slice(3) : ranked}
        startRank={showPodium ? 3 : 0}
        emptyMessage={rankedEmptyMessage}
        useRating={useRating}
      />
      {unranked.length > 0 ? (
        <div className="border-t border-club-border">
          <div className="border-b border-club-border px-4 py-3">
            <div className="text-sm font-medium">Not ranked yet</div>
            <p className="mt-0.5 text-xs text-subtle">
              {minGamesForRank}+ games needed to appear on the board. Points still count toward
              your total once you qualify.
            </p>
          </div>
          <UnrankedLeaderboardList
            entries={unranked}
            minGamesForRank={minGamesForRank}
            useRating={useRating}
          />
        </div>
      ) : null}
    </>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [minGamesForRank, setMinGamesForRank] = useState(LEADERBOARD_MIN_GAMES_FOR_RANK_LEGACY);
  const [useRating, setUseRating] = useState(false);
  const [period, setPeriod] = useState<LeaderboardScoringPeriod | null>(null);
  const [gamesWithPlayers, setGamesWithPlayers] = useState(0);
  const [periodLabel, setPeriodLabel] = useState("");
  const [archives, setArchives] = useState<MonthlyArchive[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [currentRes, archivesRes] = await Promise.all([
          fetch("/api/leaderboard"),
          fetch("/api/leaderboard/archives"),
        ]);
        const currentJson = (await currentRes.json()) as {
          entries?: LeaderboardEntry[];
          minGamesForRank?: number;
          useRating?: boolean;
          gamesWithPlayers?: number;
          period?: { year?: number; month?: number; label?: string };
          error?: string;
        };
        const archivesJson = (await archivesRes.json()) as {
          archives?: MonthlyArchive[];
          error?: string;
        };

        if (!currentRes.ok) throw new Error(currentJson.error ?? "Failed to load leaderboard");
        if (!archivesRes.ok) throw new Error(archivesJson.error ?? "Failed to load archives");

        if (!cancelled) {
          setEntries(currentJson.entries ?? []);
          setMinGamesForRank(
            currentJson.minGamesForRank ?? LEADERBOARD_MIN_GAMES_FOR_RANK_LEGACY
          );
          setUseRating(currentJson.useRating ?? false);
          if (currentJson.period?.year && currentJson.period?.month) {
            setPeriod({
              year: currentJson.period.year,
              month: currentJson.period.month,
            });
          }
          setGamesWithPlayers(currentJson.gamesWithPlayers ?? 0);
          setPeriodLabel(currentJson.period?.label ?? "This month");
          setArchives(archivesJson.archives ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load leaderboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { ranked, unranked, inactive } = useMemo(
    () =>
      period
        ? splitLeaderboardEntries(entries, period)
        : { ranked: [], unranked: [], inactive: [] },
    [entries, period]
  );
  const hasAnyActivity = ranked.length > 0 || unranked.length > 0;

  return (
    <main className="space-y-7">
      <PageHeader
        badge="Monthly standings"
        title="Leaderboard"
        description="Standings reset each calendar month (US Eastern). Counts all finished games for the month. Past months can be downloaded below."
        action={
          <Link href="/import" className="btn-primary h-11 shrink-0 px-4">
            Import game
          </Link>
        }
      />

      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="card overflow-hidden">
        <div className="border-b border-club-border px-4 py-3.5">
          <div className="text-sm font-medium">{periodLabel || "This month"}</div>
          <div className="mt-0.5 text-xs text-subtle">
            {gamesWithPlayers} game{gamesWithPlayers === 1 ? "" : "s"} this month ·{" "}
            {useRating ? "net" : "points"} = (ending − start) ÷ 1,000 · ranked after{" "}
            {minGamesForRank}+ games
          </div>
          {useRating ? (
            <div className="mt-1 text-xs text-subtle">
              Rating = confidence-weighted net total (more games with the same net ranks higher).
              Avg shows net per game — one hot or cold game matters less as you play more.
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-muted">Loading standings…</div>
        ) : !hasAnyActivity ? (
          <div className="space-y-3 px-4 py-8 text-sm text-muted">
            <p>
              No games this month yet. End a session on the site or{" "}
              <Link href="/import" className="font-medium underline">
                import a game
              </Link>
              .
            </p>
            <Link href="/players" className="font-medium underline">
              Add players
            </Link>
          </div>
        ) : period ? (
          <LeaderboardSections
            entries={entries}
            period={period}
            minGamesForRank={minGamesForRank}
            useRating={useRating}
            rankedEmptyMessage={`No players with ${minGamesForRank}+ games yet this month.`}
            showPodium
          />
        ) : null}
      </div>

      {!loading && inactive.length > 0 ? (
        <div className="card p-4">
          <div className="text-sm font-medium">Not on the board yet this month</div>
          <p className="mt-0.5 text-xs text-subtle">No finished games recorded yet.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {inactive.map((e) => (
              <li
                key={e.playerId}
                className="rounded-full border border-club-border bg-club-surface px-3 py-1 text-sm"
              >
                {e.displayName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && archives.length > 0 ? (
        <div className="card">
          <div className="border-b border-club-border px-4 py-3.5">
            <div className="text-sm font-medium">Past months</div>
            <p className="mt-0.5 text-xs text-subtle">
              Final standings saved when each month ended. Download as CSV or JSON.
            </p>
          </div>
          <ul className="divide-y divide-club-border">
            {archives.map((archive) => (
              <li key={archive.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{archive.label}</div>
                    <div className="text-xs text-subtle">
                      {archive.gamesCount} game{archive.gamesCount === 1 ? "" : "s"} · archived{" "}
                      {new Date(archive.archivedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/leaderboard/archives/download?year=${archive.year}&month=${archive.month}&format=csv`}
                      className="inline-flex h-9 items-center rounded-lg border border-club-border bg-club-surface px-3 text-xs font-medium transition-colors hover:bg-stone-50 dark:hover:bg-stone-700"
                    >
                      Download CSV
                    </a>
                    <a
                      href={`/api/leaderboard/archives/download?year=${archive.year}&month=${archive.month}&format=json`}
                      className="inline-flex h-9 items-center rounded-lg border border-club-border bg-club-surface px-3 text-xs font-medium transition-colors hover:bg-stone-50 dark:hover:bg-stone-700"
                    >
                      Download JSON
                    </a>
                  </div>
                </div>
                {archive.entries.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-club-ink">
                      View standings
                    </summary>
                    <div className="mt-2 overflow-hidden rounded-xl border border-club-border bg-club-surface">
                      {(() => {
                        const archivePeriod = { year: archive.year, month: archive.month };
                        const archiveScoring = getLeaderboardScoringOptions(archivePeriod);
                        return (
                          <LeaderboardSections
                            entries={archive.entries}
                            period={archivePeriod}
                            minGamesForRank={archiveScoring.minGamesForRank}
                            useRating={archiveScoring.useRating}
                            rankedEmptyMessage="No ranked players that month."
                          />
                        );
                      })()}
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
