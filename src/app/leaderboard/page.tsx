"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";

function formatDelta(value: number) {
  const formatted = Math.abs(value).toLocaleString();
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "0";
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [gamesWithPlayers, setGamesWithPlayers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/leaderboard");
        const json = (await res.json()) as {
          entries?: LeaderboardEntry[];
          gamesWithPlayers?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Failed to load leaderboard");
        if (!cancelled) {
          setEntries(json.entries ?? []);
          setGamesWithPlayers(json.gamesWithPlayers ?? 0);
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
        <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
          Overall standings across every game with seat assignments. Points show net gain or loss
          versus each session&apos;s starting stack ({gamesWithPlayers} game
          {gamesWithPlayers === 1 ? "" : "s"} counted).
        </p>
      </div>

      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="hidden border-b border-zinc-200 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 sm:grid sm:grid-cols-[2.5rem_1fr_repeat(4,minmax(0,1fr))] sm:gap-3 dark:border-zinc-800">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Games</span>
          <span className="text-right">1st place</span>
          <span className="text-right">Total pts</span>
          <span className="text-right">Avg / game</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300">Loading standings…</div>
        ) : activeEntries.length === 0 ? (
          <div className="space-y-3 px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300">
            <p>No ranked games yet. Assign players to seats in a session, then record hands.</p>
            <Link href="/players" className="font-medium underline">
              Add players
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {activeEntries.map((entry, index) => (
              <li
                key={entry.playerId}
                className="px-4 py-4 sm:grid sm:grid-cols-[2.5rem_1fr_repeat(4,minmax(0,1fr))] sm:items-center sm:gap-3 sm:py-3"
              >
                <div className="flex items-start gap-3 sm:contents">
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
                  <div className="min-w-0 flex-1 sm:col-start-2">
                    <div className="truncate font-medium">{entry.displayName}</div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:hidden">
                      <span className="text-zinc-500">Games</span>
                      <span className="text-right font-medium">{entry.gamesPlayed}</span>
                      <span className="text-zinc-500">1st place</span>
                      <span className="text-right font-medium">{entry.firstPlaces}</span>
                      <span className="text-zinc-500">Total pts</span>
                      <span
                        className={`text-right font-medium tabular-nums ${
                          entry.totalDelta > 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : entry.totalDelta < 0
                              ? "text-red-600 dark:text-red-400"
                              : ""
                        }`}
                      >
                        {formatDelta(entry.totalDelta)}
                      </span>
                      <span className="text-zinc-500">Avg / game</span>
                      <span className="text-right font-medium tabular-nums">
                        {formatDelta(entry.averageDelta)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="hidden text-right text-sm tabular-nums sm:block">{entry.gamesPlayed}</div>
                <div className="hidden text-right text-sm tabular-nums sm:block">{entry.firstPlaces}</div>
                <div
                  className={`hidden text-right text-sm font-medium tabular-nums sm:block ${
                    entry.totalDelta > 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : entry.totalDelta < 0
                        ? "text-red-600 dark:text-red-400"
                        : ""
                  }`}
                >
                  {formatDelta(entry.totalDelta)}
                </div>
                <div className="hidden text-right text-sm tabular-nums sm:block">
                  {formatDelta(entry.averageDelta)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && entries.some((e) => e.gamesPlayed === 0) ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium">Not on the board yet</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            These players have no completed seat assignments in any game.
          </p>
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
    </main>
  );
}
