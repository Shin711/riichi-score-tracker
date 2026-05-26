"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Rules, Seat, SessionEvent } from "@/lib/scoring/ledger";
import {
  buildRonDeltas,
  buildTsumoDeltas,
  computeTotals,
  defaultRules,
} from "@/lib/scoring/ledger";
import { mapEventRow } from "@/lib/scoring/events";
import { getStoredEditKey, storeEditKey } from "@/lib/editKey";
import { getSupabaseClient } from "@/lib/supabase/client";

const seats: Seat[] = ["E", "S", "W", "N"];

function seatLabel(seat: Seat) {
  if (seat === "E") return "East";
  if (seat === "S") return "South";
  if (seat === "W") return "West";
  return "North";
}

type PlayerOption = { id: string; display_name: string };

function getInitialEditKey(shareId: string) {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("editKey");
  if (fromUrl) {
    storeEditKey(shareId, fromUrl);
    return fromUrl;
  }
  return getStoredEditKey(shareId);
}

export function SessionClient({ shareId }: { shareId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [title, setTitle] = useState("Session");
  const [rules, setRules] = useState<Rules>(defaultRules());
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | undefined>(() => getInitialEditKey(shareId));
  const [editKeyInput, setEditKeyInput] = useState("");
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [seatPlayerId, setSeatPlayerId] = useState<Record<Seat, string>>({ E: "", S: "", W: "", N: "" });
  const [seatPlayerName, setSeatPlayerName] = useState<Record<Seat, string>>({
    E: "",
    S: "",
    W: "",
    N: "",
  });

  const [riichiSeat, setRiichiSeat] = useState<Seat>("E");
  const [riichiValue, setRiichiValue] = useState(1000);

  const [eventNote, setEventNote] = useState("");
  const [manualDelta, setManualDelta] = useState<Record<Seat, number>>({ E: 0, S: 0, W: 0, N: 0 });

  const [winType, setWinType] = useState<"ron" | "tsumo">("ron");
  const [winner, setWinner] = useState<Seat>("E");
  const [fromSeat, setFromSeat] = useState<Seat>("S");
  const [winPoints, setWinPoints] = useState(8000);
  const [honba, setHonba] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${shareId}`);
    const json = (await res.json()) as {
      session?: { title: string | null; rules_json: Rules };
      events?: Array<{
        type: string;
        payload_json: Record<string, unknown>;
        created_at: string;
        id: string;
        session_id: string;
      }>;
      sessionPlayers?: Array<{
        seat: Seat;
        player_id: string;
        players?: { display_name: string } | null;
      }>;
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Failed to load session");
    setTitle(json.session?.title ?? "Session");
    setRules(json.session?.rules_json ?? defaultRules());
    setEvents((json.events ?? []).map((r) => mapEventRow(r)));

    const nextSeats: Record<Seat, string> = { E: "", S: "", W: "", N: "" };
    const nextNames: Record<Seat, string> = { E: "", S: "", W: "", N: "" };
    for (const sp of json.sessionPlayers ?? []) {
      if (sp.seat === "E" || sp.seat === "S" || sp.seat === "W" || sp.seat === "N") {
        nextSeats[sp.seat] = sp.player_id;
        nextNames[sp.seat] = sp.players?.display_name ?? "";
      }
    }
    setSeatPlayerId(nextSeats);
    setSeatPlayerName(nextNames);
  }, [shareId]);

  useEffect(() => {
    let cancelled = false;
    async function runLoad() {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    void runLoad();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from("players")
      .select("id, display_name")
      .order("display_name")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setPlayers((data ?? []) as PlayerOption[]);
      });
  }, [supabase]);

  const totals = computeTotals(seats, rules, events);
  const canEdit = Boolean(editKey);
  const shareUrl = typeof window === "undefined" ? `/s/${shareId}` : `${window.location.origin}/s/${shareId}`;
  const editUrl = canEdit ? `${shareUrl}?editKey=${encodeURIComponent(editKey ?? "")}` : null;

  async function postEvent(type: string, payload: Record<string, unknown>) {
    if (!editKey) {
      setError("Editing is not enabled on this device (missing edit key).");
      return;
    }
    const res = await fetch(`/api/sessions/${shareId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-edit-key": editKey },
      body: JSON.stringify({ type, payload }),
    });
    const json = (await res.json()) as { event?: { type: string; payload_json: Record<string, unknown>; created_at: string; id: string; session_id: string }; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to add event");
    if (json.event) setEvents((prev) => [...prev, mapEventRow(json.event!)]);
  }

  async function onClaim() {
    setClaimStatus(null);
    setError(null);
    if (!supabase || !editKey) {
      setError("Sign in and enable editing to claim this session.");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("Please sign in first.");
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Missing auth session.");
      return;
    }

    const res = await fetch(`/api/sessions/${shareId}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ editKey }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) setError(json.error ?? "Failed to claim");
    else setClaimStatus("Session claimed to your account.");
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setClaimStatus(`${label} copied.`);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  function saveEditKeyFromInput() {
    const trimmed = editKeyInput.trim();
    if (!trimmed) {
      setError("Enter an edit key first.");
      return;
    }
    storeEditKey(shareId, trimmed);
    setEditKey(trimmed);
    setError(null);
  }

  async function onUndoLastEvent() {
    if (!editKey) {
      setError("Editing is not enabled on this device.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/sessions/${shareId}/events`, {
      method: "DELETE",
      headers: { "x-edit-key": editKey },
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to undo event");
    }
    setError(null);
    await load();
  }

  async function onSaveSessionMeta() {
    if (!editKey) {
      setError("Editing is not enabled on this device.");
      return;
    }
    setError(null);
    const res = await fetch(`/api/sessions/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-edit-key": editKey },
      body: JSON.stringify({ title, rules_json: rules }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to save rules");
  }

  function onAddWin() {
    if (winType === "ron" && winner === fromSeat) {
      setError("Winner and discarder cannot be the same seat.");
      return;
    }
    const honbaPay = honba * rules.honbaValue * (winType === "ron" ? 1 : 3);
    const total = winPoints + honbaPay;
    const deltas =
      winType === "ron" ? buildRonDeltas(winner, fromSeat, total) : buildTsumoDeltas(winner, total);
    void postEvent("win", {
      deltas,
      note: `${winType.toUpperCase()} ${total.toLocaleString()}${honba ? ` (honba ${honba})` : ""}${eventNote.trim() ? ` — ${eventNote.trim()}` : ""}`,
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Share: <span className="font-mono">/s/{shareId}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {canEdit ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              Editing enabled
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              View-only
            </span>
          )}
          {canEdit ? (
            <button
              onClick={() => void onClaim()}
              className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              Claim session
            </button>
          ) : null}
        </div>
      </div>

      {claimStatus ? <div className="text-sm text-emerald-700 dark:text-emerald-300">{claimStatus}</div> : null}
      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm font-medium">Share and editing</div>
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">Viewer link</div>
              <button
                type="button"
                onClick={() => void copyText("Viewer link", shareUrl)}
                className="text-xs underline"
              >
                Copy
              </button>
            </div>
            <div className="mt-1 break-all font-mono text-xs">{shareUrl}</div>
          </div>
          {editUrl ? (
            <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500">Editor link</div>
                <button
                  type="button"
                  onClick={() => void copyText("Editor link", editUrl)}
                  className="text-xs underline"
                >
                  Copy
                </button>
              </div>
              <div className="mt-1 break-all font-mono text-xs">{editUrl}</div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={editKeyInput}
              onChange={(e) => setEditKeyInput(e.target.value)}
              placeholder="Paste edit key"
              className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
            <button
              onClick={saveEditKeyFromInput}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              Enable editing on this device
            </button>
          </div>
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          To edit on this device, open the original “create session” link once (it includes an edit key), or ask
          the host to share the edit URL.
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="text-xs">
          Session title
          <input
            disabled={!canEdit}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
        </label>
        <div className="text-sm font-medium">Rules</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs">
            Starting
            <input
              type="number"
              disabled={!canEdit}
              value={rules.startingPoints}
              onChange={(e) => setRules((r) => ({ ...r, startingPoints: Number(e.target.value) }))}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs">
            Return
            <input
              type="number"
              disabled={!canEdit}
              value={rules.returnPoints}
              onChange={(e) => setRules((r) => ({ ...r, returnPoints: Number(e.target.value) }))}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs">
            Riichi stick
            <input
              type="number"
              disabled={!canEdit}
              value={rules.riichiStickValue}
              onChange={(e) => setRules((r) => ({ ...r, riichiStickValue: Number(e.target.value) }))}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
          <label className="text-xs">
            Honba (each)
            <input
              type="number"
              disabled={!canEdit}
              value={rules.honbaValue}
              onChange={(e) => setRules((r) => ({ ...r, honbaValue: Number(e.target.value) }))}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Rules are stored in the session record.
        </p>
        <button
          disabled={!canEdit}
          onClick={() =>
            void onSaveSessionMeta().catch((e) => setError(e instanceof Error ? e.message : "Failed"))
          }
          className="mt-3 h-10 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
        >
          Save title and rules
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm font-medium">Seats (player assignment)</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {seats.map((seat) => (
            <label key={seat} className="text-xs">
              {seatLabel(seat)}
              <select
                disabled={!canEdit}
                value={seatPlayerId[seat]}
                onChange={(e) => {
                  const playerId = e.target.value;
                  const player = players.find((p) => p.id === playerId);
                  setSeatPlayerId((s) => ({ ...s, [seat]: playerId }));
                  setSeatPlayerName((n) => ({ ...n, [seat]: player?.display_name ?? "" }));
                }}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">—</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={!canEdit}
            onClick={() =>
              void fetch(`/api/sessions/${shareId}/players`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-edit-key": editKey ?? "" },
                body: JSON.stringify({ assignments: seatPlayerId }),
              })
                .then(async (res) => {
                  if (!res.ok) {
                    const j = (await res.json()) as { error?: string };
                    throw new Error(j.error ?? "Failed to save seats");
                  }
                })
                .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
            }
            className="h-10 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
          >
            Save seat assignments
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Add players on the <Link href="/players" className="underline">Players</Link> page first.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium">Scoreboard</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {seats.map((s) => (
              <div
                key={s}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-xs text-zinc-500">{seatLabel(s)}</div>
                {seatPlayerName[s] ? (
                  <div className="truncate text-sm font-medium">{seatPlayerName[s]}</div>
                ) : null}
                <div className="mt-1 font-mono text-lg">{totals[s].toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium">Add event</div>
          <div className="mt-3 space-y-4">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs font-medium">Win (ron / tsumo)</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={winType}
                  onChange={(e) => setWinType(e.target.value as "ron" | "tsumo")}
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="ron">Ron</option>
                  <option value="tsumo">Tsumo</option>
                </select>
                <input
                  type="number"
                  value={winPoints}
                  onChange={(e) => setWinPoints(Number(e.target.value))}
                  placeholder="Hand points"
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
                <select
                  value={winner}
                  onChange={(e) => setWinner(e.target.value as Seat)}
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {seats.map((s) => (
                    <option key={s} value={s}>
                      Winner: {seatLabel(s)}
                    </option>
                  ))}
                </select>
                {winType === "ron" ? (
                  <select
                    value={fromSeat}
                    onChange={(e) => setFromSeat(e.target.value as Seat)}
                    className="h-10 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {seats.map((s) => (
                      <option key={s} value={s}>
                        From: {seatLabel(s)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div />
                )}
              </div>
              <label className="mt-2 block text-xs">
                Honba sticks on table (0 if none)
                <input
                  type="number"
                  min={0}
                  value={honba}
                  onChange={(e) => setHonba(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
              </label>
              <p className="mt-1 text-xs text-zinc-500">
                Adds honba × {rules.honbaValue} × {winType === "ron" ? "1" : "3"} to hand points.
              </p>
              <input
                value={eventNote}
                onChange={(e) => setEventNote(e.target.value)}
                placeholder="Optional note"
                className="mt-2 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <button
                disabled={!canEdit}
                onClick={onAddWin}
                className="mt-2 h-10 w-full rounded-lg bg-zinc-950 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
              >
                Record win
              </button>
            </div>

            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs font-medium">Riichi stick placed</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <select
                  value={riichiSeat}
                  onChange={(e) => setRiichiSeat(e.target.value as Seat)}
                  className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {seats.map((s) => (
                    <option key={s} value={s}>
                      {seatLabel(s)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={riichiValue}
                  onChange={(e) => setRiichiValue(Number(e.target.value))}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950 sm:w-28"
                />
                <button
                  disabled={!canEdit}
                  onClick={() =>
                    void postEvent("riichi", { seat: riichiSeat, value: riichiValue }).catch((e) =>
                      setError(e instanceof Error ? e.message : "Failed")
                    )
                  }
                  className="h-10 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs font-medium">Manual adjustment</div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {seats.map((s) => (
                  <label key={s} className="text-xs">
                    {s}
                    <input
                      type="number"
                      value={manualDelta[s]}
                      onChange={(e) => setManualDelta((d) => ({ ...d, [s]: Number(e.target.value) }))}
                      className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                ))}
              </div>
              <button
                disabled={!canEdit}
                onClick={() =>
                  void postEvent("manual_adjustment", {
                    deltaBySeat: manualDelta,
                    note: eventNote.trim() || undefined,
                  }).catch((e) => setError(e instanceof Error ? e.message : "Failed"))
                }
                className="mt-2 h-10 w-full rounded-lg bg-zinc-950 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
              >
                Add adjustment
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-sm font-medium">History</div>
          <button
            disabled={!canEdit || events.length === 0}
            onClick={() =>
              void onUndoLastEvent().catch((e) =>
                setError(e instanceof Error ? e.message : "Failed to undo")
              )
            }
            className="h-8 rounded-lg border border-zinc-200 px-2 text-xs disabled:opacity-40 dark:border-zinc-800"
          >
            Undo last event
          </button>
        </div>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {events.map((ev, idx) => (
            <li key={idx} className="px-4 py-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-medium">{ev.type}</div>
                <div className="text-xs text-zinc-500">{new Date(ev.createdAt).toLocaleString()}</div>
              </div>
              {"note" in ev && ev.note ? (
                <div className="mt-1 text-zinc-600 dark:text-zinc-300">{ev.note}</div>
              ) : null}
            </li>
          ))}
          {events.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-300">No events yet.</li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}
