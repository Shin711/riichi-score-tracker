"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ImportedGameEntry, ImportedGameRow } from "@/lib/imports/types";
import { isValidMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { formatLeaderboardPoints, gameScoreDelta } from "@/lib/leaderboard/points";
import { formatMonthLabel, getMonthPartsInTimezone } from "@/lib/leaderboard/timezone";
import { getSupabaseClient } from "@/lib/supabase/client";

const seatLabels = ["East", "South", "West", "North"] as const;
const IMPORT_HISTORY_PAGE_SIZE = 10;

type PlayerOption = { id: string; display_name: string };

type SeatForm = {
  playerId: string;
  displayName: string;
  finalScore: string;
  isAi: boolean;
};

function defaultSeats(): SeatForm[] {
  return seatLabels.map(() => ({ playerId: "", displayName: "", finalScore: "", isAi: false }));
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type RankedImportEntry = ImportedGameEntry & { placement: number };

function rankedImportEntries(entries: ImportedGameEntry[]): RankedImportEntry[] {
  return [...entries]
    .sort((a, b) => b.final_score - a.final_score)
    .map((entry, index) => ({ ...entry, placement: index + 1 }));
}

function leaderboardMonthLabel(playedAt: string) {
  const { year, month } = getMonthPartsInTimezone(new Date(playedAt));
  return formatMonthLabel(year, month);
}

function formatImportPlayedAt(playedAt: string) {
  return new Date(playedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function importPointsClassName(delta: number) {
  if (delta > 0) return "text-emerald-700 dark:text-emerald-400";
  if (delta < 0) return "text-red-600 dark:text-red-400";
  return "text-subtle";
}

function ImportHistoryCard({
  row,
  confirmDeleteId,
  deletingId,
  onConfirmDelete,
  onCancelDelete,
  onRequestDelete,
}: {
  row: ImportedGameRow;
  confirmDeleteId: string | null;
  deletingId: string | null;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onRequestDelete: (id: string) => void;
}) {
  const ranked = rankedImportEntries(row.entries_json ?? []);
  const monthLabel = leaderboardMonthLabel(row.played_at);
  const playedLabel = formatImportPlayedAt(row.played_at);

  return (
    <li className="import-history-entry">
      <div className="import-history-entry-header">
        <div className="min-w-0">
          <div className="text-sm font-medium text-club-ink">{playedLabel}</div>
          <div className="text-xs text-subtle">Counts toward {monthLabel}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {row.mjs_paipu_url ? (
            <a
              href={row.mjs_paipu_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium underline"
            >
              Log
            </a>
          ) : null}
          {confirmDeleteId !== row.id ? (
            <button
              type="button"
              onClick={() => onRequestDelete(row.id)}
              className="text-xs text-red-600 underline dark:text-red-400"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto px-3 py-1">
        <table className="w-full min-w-[17rem] max-w-md text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] font-medium uppercase tracking-wide text-subtle underline [border-color:var(--color-club-border)]">
              <th className="w-8 py-2 pr-3">#</th>
              <th className="py-2 pr-3">Player</th>
              <th className="w-[5.5rem] py-2 pr-3 text-right">Score</th>
              <th className="w-[3.5rem] py-2 text-right">LB pts</th>
            </tr>
          </thead>
          <tbody className="divide-club">
            {ranked.map((entry, entryIndex) => {
              const delta = gameScoreDelta(entry.final_score, row.starting_points);
              return (
                <tr
                  key={entry.player_id ?? `${entry.display_name}-${entryIndex}`}
                  className={entry.is_ai ? "text-subtle" : undefined}
                >
                  <td className="py-2 pr-3 tabular-nums text-subtle">{entry.placement}</td>
                  <td className="max-w-[10rem] truncate py-2 pr-3 sm:max-w-none">
                    <span className="font-medium text-club-ink">{entry.display_name}</span>
                    {entry.is_ai ? <span className="text-subtle"> · AI</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                    {entry.final_score.toLocaleString()}
                  </td>
                  <td
                    className={`py-2 text-right font-mono font-semibold tabular-nums ${
                      entry.is_ai ? "text-subtle" : importPointsClassName(delta)
                    }`}
                  >
                    {entry.is_ai ? "—" : formatLeaderboardPoints(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmDeleteId === row.id ? (
        <div className="border-t border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/40">
          <p className="text-xs leading-5 text-red-900 dark:text-red-200">
            Remove this import? It will leave the {monthLabel} leaderboard. This cannot be undone.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deletingId === row.id}
              onClick={onCancelDelete}
              className="h-9 rounded-lg border border-stone-200 bg-club-surface px-3 text-xs font-medium dark:border-stone-600 dark:text-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingId === row.id}
              onClick={() => onConfirmDelete(row.id)}
              className="h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {deletingId === row.id ? "Removing…" : "Yes, remove"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ImportHistoryPagination({
  historyPage,
  historyTotalPages,
  historyLoading,
  onPageChange,
}: {
  historyPage: number;
  historyTotalPages: number;
  historyLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (historyTotalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={historyLoading || historyPage <= 1}
        onClick={() => onPageChange(Math.max(1, historyPage - 1))}
        className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-medium disabled:opacity-40 dark:border-zinc-700"
      >
        Previous
      </button>
      <span className="text-xs tabular-nums text-subtle">
        Page {historyPage} of {historyTotalPages}
      </span>
      <button
        type="button"
        disabled={historyLoading || historyPage >= historyTotalPages}
        onClick={() => onPageChange(Math.min(historyTotalPages, historyPage + 1))}
        className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-medium disabled:opacity-40 dark:border-zinc-700"
      >
        Next
      </button>
    </div>
  );
}

export function ImportGameForm() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [seats, setSeats] = useState<SeatForm[]>(defaultSeats);
  const [playedAt, setPlayedAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [startingPoints, setStartingPoints] = useState(25000);
  const [mjsPaipuUrl, setMjsPaipuUrl] = useState("");
  const [imports, setImports] = useState<ImportedGameRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!supabase) return;
      const { data, error: err } = await supabase
        .from("players")
        .select("id, display_name")
        .order("display_name");
      if (!cancelled && !err) setPlayers((data ?? []) as PlayerOption[]);
    }

    void loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      const params = new URLSearchParams({
        page: String(historyPage),
        pageSize: String(IMPORT_HISTORY_PAGE_SIZE),
      });
      const res = await fetch(`/api/imports/games?${params}`);
      const json = (await res.json()) as {
        imports?: ImportedGameRow[];
        total?: number;
        totalPages?: number;
      };

      if (cancelled || !res.ok) {
        if (!cancelled) setHistoryLoading(false);
        return;
      }

      const totalPages = json.totalPages ?? 0;
      if (totalPages > 0 && historyPage > totalPages) {
        setHistoryPage(totalPages);
        return;
      }

      setImports(json.imports ?? []);
      setHistoryTotal(json.total ?? 0);
      setHistoryTotalPages(totalPages);
      setHistoryLoading(false);
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyPage, historyRefresh]);

  const paipuValid = !mjsPaipuUrl.trim() || isValidMjsPaipuUrl(mjsPaipuUrl);

  const scoreSumWarning = useMemo(() => {
    const scores = seats.map((s) => Number(s.finalScore));
    if (scores.some((n) => !Number.isFinite(n))) return null;
    const expected = startingPoints * 4;
    const sum = scores.reduce((a, b) => a + b, 0);
    if (sum !== expected) {
      return `Scores sum to ${sum.toLocaleString()}, but four × ${startingPoints.toLocaleString()} = ${expected.toLocaleString()}. Double-check for typos.`;
    }
    return null;
  }, [seats, startingPoints]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!paipuValid) {
      setError("Paste a valid Mahjong Soul log link, or leave it empty.");
      return;
    }

    const humanSeats = seats.filter((s) => !s.isAi);
    if (humanSeats.length === 0) {
      setError("Mark at least one seat as a human player.");
      return;
    }

    for (const seat of humanSeats) {
      const name = seat.playerId
        ? players.find((p) => p.id === seat.playerId)?.display_name ?? seat.displayName
        : seat.displayName.trim();
      if (!name) {
        setError("Each human seat needs a player name.");
        return;
      }
    }

    for (const seat of seats) {
      if (!Number.isFinite(Number(seat.finalScore))) {
        setError("Enter a final score for every seat (including AI).");
        return;
      }
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
            isAi: s.isAi,
            ...(s.isAi
              ? { finalScore: Number(s.finalScore) }
              : {
                  playerId: s.playerId || undefined,
                  displayName: s.playerId
                    ? players.find((p) => p.id === s.playerId)?.display_name ?? s.displayName
                    : s.displayName.trim(),
                  finalScore: Number(s.finalScore),
                }),
          })),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Import failed");

      setStatus("Game imported. It will appear on the leaderboard for that month.");
      setSeats(defaultSeats());
      setMjsPaipuUrl("");
      setPlayedAt(toDatetimeLocalValue(new Date()));
      setHistoryPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/imports/games/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to delete");
        return;
      }
      setConfirmDeleteId(null);
      setStatus(null);
      if (imports.length === 1 && historyPage > 1) {
        setHistoryPage(historyPage - 1);
      } else {
        setHistoryRefresh((n) => n + 1);
      }
    } finally {
      setDeletingId(null);
    }
  }

  const historyRangeStart =
    historyTotal === 0 ? 0 : (historyPage - 1) * IMPORT_HISTORY_PAGE_SIZE + 1;
  const historyRangeEnd = Math.min(historyPage * IMPORT_HISTORY_PAGE_SIZE, historyTotal);

  function updateSeat(index: number, patch: Partial<SeatForm>) {
    setSeats((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="card p-4 sm:p-6"
      >
        <div className="text-sm font-medium">Import friendly match</div>
        <p className="mt-1 text-sm text-muted">
          Enter final scores from Mahjong Soul or any friendly table. Mark bot seats as{" "}
          <span className="font-medium">AI</span> — only human scores count on the leaderboard.
          Points: (final score − starting stack) ÷ 1,000, in the month played (US Eastern).
        </p>

        <div className="mt-4 space-y-4">
          <label className="block text-xs">
            Mahjong Soul log link (optional)
            <input
              value={mjsPaipuUrl}
              onChange={(e) => setMjsPaipuUrl(e.target.value)}
              placeholder="https://mahjongsoul.game.yo-star.com/?paipu=..."
              className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-club-surface px-3 text-sm dark:border-stone-600 dark:text-stone-100"
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
                className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-club-surface px-3 text-sm dark:border-stone-600 dark:text-stone-100"
              />
            </label>
            <label className="text-xs">
              Starting stack (each player)
              <input
                type="number"
                value={startingPoints}
                onChange={(e) => setStartingPoints(Number(e.target.value))}
                className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-club-surface px-3 text-sm dark:border-stone-600 dark:text-stone-100"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted">
              Final scores (1st → 4th placement order not required)
            </div>
            {seatLabels.map((wind, index) => (
              <div
                key={wind}
                className="grid grid-cols-[4.5rem_1fr_6.5rem] items-start gap-2 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <span className="pt-2 text-xs font-medium text-subtle">{wind}</span>
                <div className="min-w-0 space-y-1">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={seats[index].isAi}
                      onChange={(e) =>
                        updateSeat(index, {
                          isAi: e.target.checked,
                          playerId: "",
                          displayName: "",
                        })
                      }
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    AI bot
                  </label>
                  {seats[index].isAi ? (
                    <div className="flex h-9 items-center rounded-lg border border-dashed border-zinc-200 px-2 text-sm text-subtle dark:border-zinc-700">
                      AI ({wind})
                    </div>
                  ) : (
                    <>
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
                        className="h-9 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:text-stone-100"
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
                          className="h-9 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:text-stone-100"
                        />
                      ) : null}
                    </>
                  )}
                </div>
                <input
                  type="number"
                  value={seats[index].finalScore}
                  onChange={(e) => updateSeat(index, { finalScore: e.target.value })}
                  placeholder="Score"
                  className="h-9 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm tabular-nums dark:border-stone-600 dark:text-stone-100"
                />
              </div>
            ))}
            {scoreSumWarning ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">{scoreSumWarning}</p>
            ) : null}
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
            className="h-11 flex-1 rounded-xl btn-primary disabled:opacity-40"
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

        <p className="mt-3 text-xs text-subtle">
          New names are added to{" "}
          <Link href="/players" className="underline">
            Players
          </Link>{" "}
          automatically. Duplicate Mahjong Soul log links are rejected.
        </p>
      </form>

      {historyTotal > 0 || historyLoading ? (
        <div className="card">
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <div>
              <div className="text-sm font-medium">Import history</div>
              {historyTotal > 0 ? (
                <>
                  <div className="mt-0.5 text-xs text-subtle">
                    Showing {historyRangeStart}–{historyRangeEnd} of {historyTotal}
                  </div>
                  <div className="mt-0.5 text-xs text-subtle">
                    LB pts = (score − start) ÷ 1,000
                  </div>
                </>
              ) : null}
            </div>
            <ImportHistoryPagination
              historyPage={historyPage}
              historyTotalPages={historyTotalPages}
              historyLoading={historyLoading}
              onPageChange={setHistoryPage}
            />
          </div>
          {historyLoading ? (
            <div className="px-4 py-6 text-sm text-muted">Loading import history…</div>
          ) : (
            <>
              <ul className="space-y-3 p-4">
                {imports.map((row) => (
                  <ImportHistoryCard
                    key={row.id}
                    row={row}
                    confirmDeleteId={confirmDeleteId}
                    deletingId={deletingId}
                    onRequestDelete={setConfirmDeleteId}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    onConfirmDelete={(id) => void confirmDelete(id)}
                  />
                ))}
              </ul>
              {historyTotalPages > 1 ? (
                <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <ImportHistoryPagination
                    historyPage={historyPage}
                    historyTotalPages={historyTotalPages}
                    historyLoading={historyLoading}
                    onPageChange={setHistoryPage}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
