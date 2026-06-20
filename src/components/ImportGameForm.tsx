"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ImportedGameEntry, ImportedGameRow } from "@/lib/imports/types";
import { isValidMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import { formatLeaderboardPoints, gameScoreDelta } from "@/lib/leaderboard/points";
import { formatMonthLabel, getMonthPartsInTimezone, LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";
import { getSupabaseClient } from "@/lib/supabase/client";

const IMPORT_SEAT_COUNT = 4;
const IMPORT_HISTORY_PAGE_SIZE = 10;

type PlayerOption = { id: string; display_name: string };

type SeatForm = {
  playerId: string;
  displayName: string;
  finalScore: string;
  isAi: boolean;
};

function defaultSeats(): SeatForm[] {
  return Array.from({ length: IMPORT_SEAT_COUNT }, () => ({
    playerId: "",
    displayName: "",
    finalScore: "",
    isAi: false,
  }));
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPlayedAtLabel(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ImportPlayedAtInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative mt-1.5 w-full min-w-0 max-w-full overflow-hidden">
      {/* Visible field is a plain text input so layout never depends on the
          native date control (iOS WebKit sizes those by content and overflows).
          The native datetime-local sits on top, invisible and absolutely sized
          to this box via inset-0, so it can open the picker without affecting
          layout. */}
      <input
        type="text"
        readOnly
        tabIndex={-1}
        value={formatPlayedAtLabel(value)}
        placeholder="Select date & time"
        className="field h-11 w-full min-w-0 max-w-full px-3 text-base"
      />
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="When the game ended"
        className="datetime-overlay absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
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

function ordinalPlacement(place: number) {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return "4th";
}

function placementChipClass(place: number) {
  if (place === 1)
    return "bg-club-gold-muted text-club-gold border border-yellow-300/50 dark:border-yellow-700/50";
  if (place === 2) return "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-200";
  if (place === 3)
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";
}

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

function importPointsClassName(delta: number) {
  if (delta > 0) return "text-emerald-700 dark:text-emerald-400";
  if (delta < 0) return "text-red-600 dark:text-red-400";
  return "text-subtle";
}

function formatScoreDifference(delta: number) {
  if (delta === 0) return "0";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toLocaleString()}`;
}

function seatPlayerName(seat: SeatForm, players: PlayerOption[]) {
  if (seat.playerId) {
    return players.find((p) => p.id === seat.playerId)?.display_name ?? seat.displayName;
  }
  return seat.displayName;
}

function resolveSeatPlayerName(
  value: string,
  players: PlayerOption[]
): Pick<SeatForm, "playerId" | "displayName"> {
  const trimmed = value.trim();
  const match = players.find((p) => p.display_name.toLowerCase() === trimmed.toLowerCase());
  if (match) {
    return { playerId: match.id, displayName: match.display_name };
  }
  return { playerId: "", displayName: value };
}

function ImportPlayerNameInput({
  players,
  playerId,
  displayName,
  onChange,
  onOpenChange,
  inputClassName = "field field-combobox h-11 w-full px-3 text-sm",
}: {
  players: PlayerOption[];
  playerId: string;
  displayName: string;
  onChange: (patch: Pick<SeatForm, "playerId" | "displayName">) => void;
  onOpenChange?: (open: boolean) => void;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  const blurTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const value = seatPlayerName({ playerId, displayName, finalScore: "", isAi: false }, players);

  function setDropdownOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matches = query
      ? players.filter((p) => p.display_name.toLowerCase().includes(query))
      : players;
    return (matches.length > 0 ? matches : players).slice(0, 12);
  }, [players, value]);

  function handleFocus() {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    setDropdownOpen(true);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const current = e.target.value;
    blurTimer.current = window.setTimeout(() => {
      setDropdownOpen(false);
      onChange(resolveSeatPlayerName(current, players));
    }, 150);
  }

  function selectPlayer(player: PlayerOption) {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    onChange({ playerId: player.id, displayName: player.display_name });
    setDropdownOpen(false);
  }

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;

    function updatePosition() {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        visibility: "visible",
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, value]);

  const dropdown =
    open && players.length > 0 ? (
      <ul
        role="listbox"
        style={dropdownStyle}
        className="combobox-dropdown max-h-52 overflow-y-auto rounded-xl border border-club-border py-1 shadow-xl"
      >
        {suggestions.map((player) => (
          <li key={player.id} role="option" aria-selected={player.id === playerId}>
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                selectPlayer(player);
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 ${
                player.id === playerId ? "bg-club-red-muted font-medium text-club-ink" : "text-club-ink"
              }`}
            >
              {player.display_name}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="relative min-w-0">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(resolveSeatPlayerName(e.target.value, players));
          setDropdownOpen(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Player name"
        autoComplete="off"
        className={inputClassName}
      />
      {dropdown && typeof document !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
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
          <div className="text-sm font-medium text-club-ink" suppressHydrationWarning>{playedLabel}</div>
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
  const [playedAt, setPlayedAt] = useState("");
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
    async function init() {
      setPlayedAt(toDatetimeLocalValue(new Date()));
    }
    void init();
  }, []);

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

  const scoreSummary = useMemo(() => {
    const expected = startingPoints * 4;
    const entered = seats.filter((s) => s.finalScore.trim() !== "");
    const allEntered = entered.length === seats.length;
    const allValid = entered.every((s) => Number.isFinite(Number(s.finalScore)));
    const sum = entered.reduce((a, s) => a + (Number(s.finalScore) || 0), 0);
    return {
      expected,
      sum,
      difference: sum - expected,
      anyEntered: entered.length > 0,
      complete: allEntered && allValid,
      balanced: allEntered && allValid && sum === expected,
    };
  }, [seats, startingPoints]);

  const placementBySeat = useMemo(() => {
    const map = new Map<number, number>();
    const valid = seats
      .map((s, i) => ({
        i,
        score: Number(s.finalScore),
        ok: s.finalScore.trim() !== "" && Number.isFinite(Number(s.finalScore)),
      }))
      .filter((s) => s.ok);
    if (valid.length !== seats.length) return map;
    valid.sort((a, b) => b.score - a.score);
    valid.forEach((s, idx) => map.set(s.i, idx + 1));
    return map;
  }, [seats]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    if (!paipuValid) {
      setError("Paste a valid Mahjong Soul log link, or leave it empty.");
      return;
    }

    const humanSeats = seats.filter((s) => !s.isAi);
    if (humanSeats.length < 2) {
      setError("Mark at least two seats as human players.");
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
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const token = sessionData.session?.access_token;
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/imports/games", {
        method: "POST",
        headers,
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
      setHistoryRefresh((n) => n + 1);
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

  const [showStartingPoints, setShowStartingPoints] = useState(false);
  const [openNameSeatIndex, setOpenNameSeatIndex] = useState<number | null>(null);

  return (
    <div className="min-w-0 max-w-full space-y-7 overflow-x-hidden">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="card min-w-0 max-w-full divide-y divide-club-border overflow-x-clip"
      >
        {/* Player scores */}
        <div className="min-w-0 space-y-3.5 overflow-visible p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Player scores</h2>
            <span className="text-xs text-muted">placement order doesn&apos;t matter</span>
          </div>

          {Array.from({ length: IMPORT_SEAT_COUNT }, (_, index) => {
            const seatLabel = `Player ${index + 1}`;
            const placement = placementBySeat.get(index);
            const isAi = seats[index].isAi;
            const isNameOpen = openNameSeatIndex === index;
            return (
              <div
                key={seatLabel}
                className={`relative rounded-xl border p-3 transition-all duration-300 ease-fluid ${
                  isNameOpen ? "z-50 overflow-visible" : "z-0"
                } ${
                  isAi
                    ? "border-club-border bg-club-surface/50 opacity-70"
                    : isNameOpen
                      ? "border-club-border bg-club-surface shadow-md"
                      : "border-club-border bg-club-surface sm:hover:-translate-y-0.5 sm:hover:shadow-md"
                }`}
              >
                {/* Row header: seat label + placement + AI toggle */}
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-club-ink">{seatLabel}</span>
                    {placement ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${placementChipClass(placement)}`}
                      >
                        {ordinalPlacement(placement)}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSeat(index, {
                        isAi: !isAi,
                        playerId: "",
                        displayName: "",
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isAi
                        ? "border-club-red bg-club-red text-white"
                        : "border-club-border text-subtle hover:border-stone-400"
                    }`}
                  >
                    {isAi ? "AI bot" : "Mark as AI"}
                  </button>
                </div>

                {/* Name + score — single bordered row avoids iOS double-border glitches */}
                {isAi ? (
                  <div className="flex h-11 min-w-0 items-center rounded-xl border border-dashed border-club-border px-3 text-sm text-subtle">
                    AI seat — not ranked
                  </div>
                ) : (
                  <div className="seat-input-row">
                    <div className="relative min-w-0 flex-1">
                      <ImportPlayerNameInput
                        players={players}
                        playerId={seats[index].playerId}
                        displayName={seats[index].displayName}
                        onChange={(patch) => updateSeat(index, patch)}
                        onOpenChange={(open) =>
                          setOpenNameSeatIndex((current) => {
                            if (open) return index;
                            return current === index ? null : current;
                          })
                        }
                        inputClassName="field-inset h-11 w-full min-w-0 px-3 text-sm"
                      />
                    </div>
                    <div className="w-px shrink-0 self-stretch bg-club-border" aria-hidden />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={seats[index].finalScore}
                      onChange={(e) => updateSeat(index, { finalScore: e.target.value })}
                      placeholder="Score"
                      className="field-inset h-11 w-[6.5rem] shrink-0 px-3 text-base tabular-nums sm:w-28"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Running score total */}
          {scoreSummary.anyEntered ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                scoreSummary.balanced
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : scoreSummary.complete
                    ? "border-club-border bg-club-cream/50 text-club-ink"
                    : "border-club-border text-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {scoreSummary.balanced
                    ? "Table total is 100,000 ✓"
                    : scoreSummary.complete
                      ? "Table total differs from 100,000"
                      : "Total so far"}
                </span>
                <span className="font-mono tabular-nums">
                  {scoreSummary.sum.toLocaleString()}
                  {!scoreSummary.balanced ? (
                    <span className="text-subtle"> / {scoreSummary.expected.toLocaleString()}</span>
                  ) : null}
                </span>
              </div>
              {scoreSummary.complete && !scoreSummary.balanced ? (
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  This can be normal when riichi sticks or other table deposits are not included in
                  the final player scores. Import the scores as shown, and only edit them if they
                  look mistyped.
                  <span className="block font-mono tabular-nums text-subtle">
                    Difference: {formatScoreDifference(scoreSummary.difference)}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Game details */}
        <div className="min-w-0 max-w-full space-y-3.5 p-4 sm:p-6">
          <h2 className="text-sm font-semibold">Game details</h2>

          <label className="block min-w-0 max-w-full text-xs font-medium text-muted">
            When the game ended
            <ImportPlayedAtInput value={playedAt} onChange={setPlayedAt} />
          </label>

          <label className="block min-w-0 max-w-full text-xs font-medium text-muted">
            <span className="break-words">
              Mahjong Soul log link{" "}
              <span className="font-normal text-subtle">(optional)</span>
            </span>
            <input
              value={mjsPaipuUrl}
              onChange={(e) => setMjsPaipuUrl(e.target.value)}
              placeholder="https://mahjongsoul.game.yo-star.com/?paipu=…"
              className="field mt-1.5 h-11 w-full min-w-0 max-w-full px-3 text-sm"
            />
            {mjsPaipuUrl.trim() && !paipuValid ? (
              <span className="mt-1 block font-normal text-red-600 dark:text-red-400">
                Link format not recognized.
              </span>
            ) : null}
          </label>

          <div>
            <button
              type="button"
              onClick={() => setShowStartingPoints((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted"
            >
              <span className="underline">Starting stack</span>
              <span className="text-subtle">
                {showStartingPoints ? "▲" : "▼"} currently {startingPoints.toLocaleString()}
              </span>
            </button>
            {showStartingPoints ? (
              <input
                type="number"
                inputMode="numeric"
                value={startingPoints}
                onChange={(e) => setStartingPoints(Number(e.target.value))}
                className="field mt-1.5 h-11 w-40 px-3 text-base"
              />
            ) : null}
          </div>
        </div>

        {/* Submit */}
        <div className="p-4 sm:p-6">
          {error ? <div className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
          {status ? (
            <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {status}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary h-12 w-full rounded-xl text-base font-semibold disabled:opacity-40 sm:h-11 sm:flex-1"
            >
              {submitting ? "Importing…" : "Import game"}
            </button>
            <Link
              href="/leaderboard"
              className="btn-secondary inline-flex h-11 w-full items-center justify-center px-4 sm:w-auto"
            >
              View leaderboard
            </Link>
          </div>

          <p className="mt-3 text-xs text-subtle">
            New names are added to{" "}
            <Link href="/players" className="underline">
              Players
            </Link>{" "}
            automatically. Duplicate MJS log links are rejected. LB pts = (score − {startingPoints.toLocaleString()}) ÷ 1,000.
          </p>
        </div>
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
