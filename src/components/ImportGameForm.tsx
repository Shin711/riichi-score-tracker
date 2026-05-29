"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ImportedGameRow } from "@/lib/imports/types";
import { isValidMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { getSupabaseClient } from "@/lib/supabase/client";

const seatLabels = ["East", "South", "West", "North"] as const;

type PlayerOption = { id: string; display_name: string };

type SeatForm = {
  playerId: string;
  displayName: string;
  finalScore: string;
};

function defaultSeats(): SeatForm[] {
  return seatLabels.map(() => ({ playerId: "", displayName: "", finalScore: "" }));
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ImportGameForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [seats, setSeats] = useState<SeatForm[]>(defaultSeats);
  const [playedAt, setPlayedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [startingPoints, setStartingPoints] = useState(25000);
  const [mjsPaipuUrl, setMjsPaipuUrl] = useState("");
  const [imports, setImports] = useState<ImportedGameRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadImports = useCallback(async () => {
    const res = await fetch("/api/imports/games");
    const json = (await res.json()) as { imports?: ImportedGameRow[]; error?: string };
    if (res.ok) setImports(json.imports ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (supabase) {
        const { data, error: err } = await supabase
          .from("players")
          .select("id, display_name")
          .order("display_name");
        if (!cancelled && !err) setPlayers((data ?? []) as PlayerOption[]);
      }

      const res = await fetch("/api/imports/games");
      const json = (await res.json()) as { imports?: ImportedGameRow[] };
      if (!cancelled && res.ok) setImports(json.imports ?? []);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const paipuValid = !mjsPaipuUrl.trim() || isValidMjsPaipuUrl(mjsPaipuUrl);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!paipuValid) {
      setError("Paste a valid Mahjong Soul log link, or leave it empty.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/imports/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playedAt: new Date(playedAt).toISOString(),
          startingPoints,
          mjsPaipuUrl: mjsPaipuUrl.trim() || undefined,
          seats: seats.map((s) => ({
            playerId: s.playerId || undefined,
            displayName: s.playerId
              ? players.find((p) => p.id === s.playerId)?.display_name ?? s.displayName
              : s.displayName.trim(),
            finalScore: Number(s.finalScore),
          })),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Import failed");

      setStatus("Game imported. It will appear on the leaderboard for that month.");
      setSeats(defaultSeats());
      setMjsPaipuUrl("");
      setPlayedAt(toDatetimeLocalValue(new Date()));
      await loadImports();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/imports/games/${id}`, { method: "DELETE" });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to delete");
      return;
    }
    await loadImports();
  }

  function updateSeat(index: number, patch: Partial<SeatForm>) {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
      >
        <div className="text-sm font-medium">Import friendly match</div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Enter final scores from Mahjong Soul or any friendly table. Points use the same rule as
          in-person games: (final score − starting stack) ÷ 1,000, counted in the month played
          (US Eastern).
        </p>

        <div className="mt-4 space-y-4">
          <label className="block text-xs">
            Mahjong Soul log link (optional)
            <input
              value={mjsPaipuUrl}
              onChange={(e) => setMjsPaipuUrl(e.target.value)}
              placeholder="https://mahjongsoul.game.yo-star.com/?paipu=..."
              className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
            {mjsPaipuUrl.trim() && !paipuValid ? (
              <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
                Link format not recognized.
              </span>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              When the game ended
              <input
                type="datetime-local"
                value={playedAt}
                onChange={(e) => setPlayedAt(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
            <label className="text-xs">
              Starting stack (each player)
              <input
                type="number"
                value={startingPoints}
                onChange={(e) => setStartingPoints(Number(e.target.value))}
                className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Final scores (1st → 4th placement order not required)
            </div>
            {seatLabels.map((wind, index) => (
              <div
                key={wind}
                className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <span className="text-xs font-medium text-zinc-500">{wind}</span>
                <div className="min-w-0 space-y-1">
                  <select
                    value={seats[index].playerId}
                    onChange={(e) => {
                      const playerId = e.target.value;
                      const player = players.find((p) => p.id === playerId);
                      updateSeat(index, {
                        playerId,
                        displayName: player?.display_name ?? seats[index].displayName,
                      });
                    }}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">New name…</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                  {!seats[index].playerId ? (
                    <input
                      value={seats[index].displayName}
                      onChange={(e) => updateSeat(index, { displayName: e.target.value })}
                      placeholder="Player name"
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  ) : null}
                </div>
                <input
                  type="number"
                  value={seats[index].finalScore}
                  onChange={(e) => updateSeat(index, { finalScore: e.target.value })}
                  placeholder="Score"
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            ))}
          </div>
        </div>

        {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        {status ? (
          <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{status}</div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={submitting}
            className="h-11 flex-1 rounded-xl bg-zinc-950 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
          >
            {submitting ? "Importing…" : "Import game"}
          </button>
          <Link
            href="/leaderboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-medium dark:border-zinc-700"
          >
            View leaderboard
          </Link>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          New names are added to{" "}
          <Link href="/players" className="underline">
            Players
          </Link>{" "}
          automatically. Duplicate Mahjong Soul log links are rejected.
        </p>
      </form>

      {imports.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium dark:border-zinc-800">
            Recent imports
          </div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {imports.map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium">
                      {new Date(row.played_at).toLocaleString()} · MJS import
                    </div>
                    <ul className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                      {(row.entries_json ?? []).map((e) => (
                        <li key={e.player_id}>
                          {e.display_name}: {e.final_score.toLocaleString()}
                        </li>
                      ))}
                    </ul>
                    {row.mjs_paipu_url ? (
                      <a
                        href={row.mjs_paipu_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs font-medium underline"
                      >
                        Open Mahjong Soul log
                      </a>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDelete(row.id)}
                    className="shrink-0 text-xs text-red-600 underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
