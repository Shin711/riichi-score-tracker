"use client";

import { useEffect, useMemo, useState } from "react";

import { ImportedGameSummaryCard } from "@/components/ImportedGameSummaryCard";
import {
  ImportPlayerNameInput,
  type ImportPlayerOption,
} from "@/components/ImportPlayerNameInput";
import { isValidMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import type { ImportedGameRow } from "@/lib/imports/types";
import { LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";
import { getSupabaseClient } from "@/lib/supabase/client";

type PreviewSeat = {
  seat: number;
  windLabel: string;
  nickname: string;
  finalScore: number;
  isAi: boolean;
  suggestedPlayerId: string | null;
  suggestedDisplayName: string | null;
};

type PreviewPayload = {
  recordUuid: string;
  paipuUrl: string;
  playedAt: string;
  startingPoints: number;
  seats: PreviewSeat[];
};

type SeatDraft = {
  seat: number;
  windLabel: string;
  nickname: string;
  finalScore: number;
  isAi: boolean;
  playerId: string;
  displayName: string;
};

function formatPreviewPlayedAt(playedAt: string) {
  return new Date(playedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: LEADERBOARD_TIMEZONE,
  });
}

function seatsFromPreview(preview: PreviewPayload): SeatDraft[] {
  return preview.seats.map((seat) => {
    if (seat.isAi) {
      return {
        seat: seat.seat,
        windLabel: seat.windLabel,
        nickname: "",
        finalScore: seat.finalScore,
        isAi: true,
        playerId: "",
        displayName: "",
      };
    }

    return {
      seat: seat.seat,
      windLabel: seat.windLabel,
      nickname: seat.nickname,
      finalScore: seat.finalScore,
      isAi: false,
      playerId: seat.suggestedPlayerId ?? "",
      displayName: seat.suggestedDisplayName ?? seat.nickname,
    };
  });
}

export function MajsoulQuickImport({ onImported }: { onImported: () => void }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [players, setPlayers] = useState<ImportPlayerOption[]>([]);
  const [input, setInput] = useState("");
  const [previewInput, setPreviewInput] = useState("");
  const [seats, setSeats] = useState<SeatDraft[] | null>(null);
  const [playedAt, setPlayedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedGameRow | null>(null);
  const [openNameSeat, setOpenNameSeat] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkConfigured() {
      try {
        const res = await fetch("/api/imports/games/mjs");
        const json = (await res.json()) as { configured?: boolean };
        if (!cancelled) setConfigured(res.ok && json.configured === true);
      } catch {
        if (!cancelled) setConfigured(false);
      }
    }

    void checkConfigured();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!supabase) return;
      const { data, error: err } = await supabase
        .from("players")
        .select("id, display_name")
        .order("display_name");
      if (!cancelled && !err) setPlayers((data ?? []) as ImportPlayerOption[]);
    }

    void loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const trimmed = input.trim();
  const inputValid = !trimmed || isValidMjsPaipuUrl(trimmed);
  const reviewing = seats !== null;

  async function authHeaders(): Promise<HeadersInit> {
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const token = sessionData.session?.access_token;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function clearPreview() {
    setSeats(null);
    setPlayedAt(null);
    setPreviewInput("");
    setOpenNameSeat(null);
  }

  async function onLoadGame(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImported(null);

    if (!trimmed) {
      setError("Paste a Mahjong Soul game ID or share link.");
      return;
    }
    if (!inputValid) {
      setError("That doesn't look like a Mahjong Soul game ID or log link.");
      return;
    }

    setLoading(true);
    clearPreview();
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/imports/games/mjs", {
        method: "POST",
        headers,
        body: JSON.stringify({ input: trimmed, preview: true }),
      });
      const json = (await res.json()) as { preview?: PreviewPayload; error?: string };
      if (!res.ok || !json.preview) throw new Error(json.error ?? "Lookup failed");

      setPreviewInput(trimmed);
      setPlayedAt(json.preview.playedAt);
      setSeats(seatsFromPreview(json.preview));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmImport() {
    if (!seats || !previewInput) return;

    setError(null);
    setImported(null);

    const missing = seats.find((seat) => !seat.isAi && !seat.displayName.trim());
    if (missing) {
      setError(`Enter a club name for ${missing.windLabel}.`);
      return;
    }

    setConfirming(true);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/imports/games/mjs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          input: previewInput,
          seats: seats
            .filter((seat) => !seat.isAi)
            .map((seat) => ({
              seat: seat.seat,
              displayName: seat.displayName.trim(),
              playerId: seat.playerId || undefined,
            })),
        }),
      });
      const json = (await res.json()) as { import?: ImportedGameRow; error?: string };
      if (!res.ok || !json.import) throw new Error(json.error ?? "Import failed");

      setImported(json.import);
      setInput("");
      clearPreview();
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setConfirming(false);
    }
  }

  function updateSeat(seatIndex: number, patch: { playerId: string; displayName: string }) {
    setSeats((current) => {
      if (!current) return current;
      return current.map((seat, index) =>
        index === seatIndex ? { ...seat, ...patch } : seat
      );
    });
  }

  // Stay out of the way until we know the server can actually do lookups.
  if (configured !== true) return null;

  return (
    <div className="card min-w-0 max-w-full overflow-x-clip">
      <form onSubmit={(e) => void onLoadGame(e)} className="space-y-3.5 p-4 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold">Add from Mahjong Soul</h2>
          <p className="mt-1 text-xs leading-5 text-subtle">
            Paste a Game Log Link from the client (including the
            &quot;Mahjong Soul Game Log:&quot; prefix). Scores come from the log —
            you can change names to match the club leaderboard before saving.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (reviewing) clearPreview();
            }}
            placeholder="Mahjong Soul Game Log:https://… or a game ID"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={loading || confirming}
            className="field h-11 w-full min-w-0 flex-1 px-3 text-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || confirming || reviewing}
            className="btn-primary h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold disabled:opacity-40 sm:w-auto"
          >
            {loading ? "Looking up…" : "Load game"}
          </button>
        </div>

        {trimmed && !inputValid ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            Link format not recognized.
          </p>
        ) : null}

        {loading ? (
          <p className="text-xs text-subtle">
            Signing in to Mahjong Soul and fetching the log — this takes a few seconds.
          </p>
        ) : null}

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </form>

      {seats && playedAt ? (
        <div className="space-y-3.5 border-t border-club-border px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium text-club-ink">
              Ended {formatPreviewPlayedAt(playedAt)}
            </p>
            <p className="mt-1 text-xs leading-5 text-subtle">
              Match each seat to a club player name. Scores are locked to the game log.
            </p>
          </div>

          <ul className="space-y-2.5">
            {seats.map((seat, index) => (
              <li
                key={seat.seat}
                className={`rounded-xl border border-club-border bg-club-surface p-3 ${
                  openNameSeat === index ? "relative z-10" : ""
                }`}
              >
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-club-ink">{seat.windLabel}</span>
                    {!seat.isAi && seat.nickname ? (
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        Mahjong Soul: {seat.nickname}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-club-ink">
                    {seat.finalScore.toLocaleString()}
                  </span>
                </div>

                {seat.isAi ? (
                  <p className="rounded-lg bg-stone-100 px-3 py-2.5 text-sm text-subtle dark:bg-stone-800/60">
                    AI — not ranked
                  </p>
                ) : (
                  <ImportPlayerNameInput
                    players={players}
                    playerId={seat.playerId}
                    displayName={seat.displayName}
                    onChange={(patch) => updateSeat(index, patch)}
                    onOpenChange={(open) =>
                      setOpenNameSeat((current) => {
                        if (open) return index;
                        return current === index ? null : current;
                      })
                    }
                    listboxId={`mjs-import-player-listbox-${seat.seat}`}
                    inputClassName="field h-11 w-full px-3 text-sm"
                  />
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={confirming}
              onClick={() => {
                setError(null);
                clearPreview();
              }}
              className="btn-secondary h-11 w-full rounded-xl px-5 text-sm font-semibold disabled:opacity-40 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirming}
              onClick={() => void onConfirmImport()}
              className="btn-primary h-11 w-full rounded-xl px-5 text-sm font-semibold disabled:opacity-40 sm:w-auto"
            >
              {confirming ? "Saving…" : "Confirm import"}
            </button>
          </div>
        </div>
      ) : null}

      {imported ? (
        <div className="border-t border-club-border">
          <div className="px-4 pt-3 text-xs font-medium text-emerald-700 sm:px-6 dark:text-emerald-400">
            Imported — this game now counts on the leaderboard.
          </div>
          <ul>
            <ImportedGameSummaryCard row={imported} />
          </ul>
        </div>
      ) : null}
    </div>
  );
}
