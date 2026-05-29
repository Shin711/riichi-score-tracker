"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";
import type { MonthlyArchive } from "@/lib/leaderboard/monthly";
import { formatLeaderboardPoints } from "@/lib/leaderboard/points";

function pointsClassName(points: number) {
  if (points > 0) return "text-emerald-700 dark:text-emerald-400";
  if (points < 0) return "text-red-600 dark:text-red-400";
  return "";
}

function LeaderboardTable({
  entries,
  emptyMessage,
}: {
  entries: LeaderboardEntry[];
  emptyMessage: string;
}) {
  const activeEntries = entries.filter((e) => e.gamesPlayed > 0);

  if (activeEntries.length === 0) {
    return <div className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300">{emptyMessage}</div>;
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {activeEntries.map((entry, index) => (
        <li
          key={entry.playerId}
          className="px-4 py-4 sm:grid sm:grid-cols-[2.5rem_1fr_6rem_5rem] sm:items-center sm:gap-3 sm:py-3"
        >
          <div className="flex items-center gap-3 sm:contents">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                index === 0
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  : index === 1
                    ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    : index === 2
                      ? "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{entry.displayName}</div>
              <div className="mt-1 text-xs text-zinc-500 sm:hidden">
                {entry.gamesPlayed} game{entry.gamesPlayed === 1 ? "" : "s"}
              </div>
            </div>
            <div
              className={`ml-auto font-mono text-lg font-semibold tabular-nums sm:ml-0 sm:text-right sm:text-base ${pointsClassName(entry.points)}`}
            >
              {formatLeaderboardPoints(entry.totalDelta)}
            </div>
          </div>
          <div className="hidden text-right text-sm tabular-nums text-zinc-500 sm:block">
            {entry.gamesPlayed}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
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
          gamesWithPlayers?: number;
          period?: { label?: string };
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

  const activeEntries = entries.filter((e) => e.gamesPlayed > 0);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Standings reset each calendar month (US Eastern). Finished games count toward the current
          month only. When a month ends, final rankings are saved permanently and can be downloaded
          below.
        </p>
      </div>

      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-sm font-medium">{periodLabel || "This month"}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {gamesWithPlayers} finished game{gamesWithPlayers === 1 ? "" : "s"} · points = (ending −
            start) ÷ 1,000 per game
          </div>
        </div>
        <div className="hidden border-b border-zinc-200 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 sm:grid sm:grid-cols-[2.5rem_1fr_6rem_5rem] sm:gap-3 dark:border-zinc-800">
          <span>Rank</span>
          <span>Name</span>
          <span className="text-right">Points</span>
          <span className="text-right">Games</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300">Loading standings…</div>
        ) : activeEntries.length === 0 ? (
          <div className="space-y-3 px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300">
            <p>
              No finished games this month yet. Assign players, record hands, then tap{" "}
              <span className="font-medium">End game</span> on the session page.
            </p>
            <Link href="/players" className="font-medium underline">
              Add players
            </Link>
          </div>
        ) : (
          <LeaderboardTable
            entries={entries}
            emptyMessage="No finished games this month yet."
          />
        )}
      </div>

      {!loading && entries.some((e) => e.gamesPlayed === 0) ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium">Not on the board yet this month</div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {entries
              .filter((e) => e.gamesPlayed === 0)
              .map((e) => (
                <li
                  key={e.playerId}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-sm dark:border-zinc-700"
                >
                  {e.displayName}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {!loading && archives.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="text-sm font-medium">Past months</div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Final standings saved when each month ended. Download as CSV or JSON.
            </p>
          </div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {archives.map((archive) => (
              <li key={archive.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{archive.label}</div>
                    <div className="text-xs text-zinc-500">
                      {archive.gamesCount} game{archive.gamesCount === 1 ? "" : "s"} · archived{" "}
                      {new Date(archive.archivedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/leaderboard/archives/download?year=${archive.year}&month=${archive.month}&format=csv`}
                      className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-700"
                    >
                      Download CSV
                    </a>
                    <a
                      href={`/api/leaderboard/archives/download?year=${archive.year}&month=${archive.month}&format=json`}
                      className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-700"
                    >
                      Download JSON
                    </a>
                  </div>
                </div>
                {archive.entries.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      View standings
                    </summary>
                    <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <LeaderboardTable
                        entries={archive.entries}
                        emptyMessage="No ranked players that month."
                      />
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
