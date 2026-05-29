"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Rules, Seat, SessionEvent } from "@/lib/scoring/ledger";
import {
  buildRonDeltas,
  buildTsumoDeltas,
  applyRiichiSticksToWin,
  computeTotals,
  pendingRiichiBySeat,
  pendingRiichiPool,
  defaultRules,
} from "@/lib/scoring/ledger";
import { formatHandHistoryEntry } from "@/lib/scoring/eventDisplay";
import { mapEventRow } from "@/lib/scoring/events";
import { applyHonbaToDeltas, scoreFromHanFu } from "@/lib/scoring/hanFu";
import {
  type DrawKind,
  computeExhaustiveDrawDeltas,
  computeNagashiManganDeltas,
  describeStandardDrawRule,
  drawKindLabel,
  formatDrawPaymentPreview,
} from "@/lib/scoring/draw";
import {
  deriveTableState,
  gameLengthLabel,
  parseSessionRules,
  roundWindLabel,
} from "@/lib/scoring/tableState";
import { storeEditKey } from "@/lib/editKey";
import { clearRecentSession, storeRecentSession } from "@/lib/recentSession";
import { isSessionEnded } from "@/lib/session/status";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useEditKey, useOrigin } from "@/hooks/useClientStorage";

const seats: Seat[] = ["E", "S", "W", "N"];
const SCORE_PRESETS = [3900, 5200, 7700, 8000, 12000];

function seatLabel(seat: Seat) {
  if (seat === "E") return "East";
  if (seat === "S") return "South";
  if (seat === "W") return "West";
  return "North";
}

function seatOptionLabel(seat: Seat, playerName: string) {
  const wind = seatLabel(seat);
  return playerName ? `${wind} (${playerName})` : wind;
}

function friendlySeatError(message: string) {
  if (message.includes("session_players_session_id_player_id_key")) {
    return "Each player can only sit in one seat. Pick a different player for this wind.";
  }
  return message;
}

type PlayerOption = { id: string; display_name: string };

export function SessionClient({ shareId }: { shareId: string }) {
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [title, setTitle] = useState("Session");
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [rules, setRules] = useState<Rules>(defaultRules());
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const storedEditKey = useEditKey(shareId);
  const [manualEditKey, setManualEditKey] = useState<string | undefined>(undefined);
  const editKey = manualEditKey ?? storedEditKey;
  const origin = useOrigin();
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

  const [manualDelta, setManualDelta] = useState<Record<Seat, number>>({ E: 0, S: 0, W: 0, N: 0 });
  const [recordTab, setRecordTab] = useState<"win" | "draw" | "adjust">("win");

  const [winType, setWinType] = useState<"ron" | "tsumo">("ron");
  const [winner, setWinner] = useState<Seat>("E");
  const [fromSeat, setFromSeat] = useState<Seat>("S");
  const [winPoints, setWinPoints] = useState(8000);
  const [winScoreMode, setWinScoreMode] = useState<"points" | "hanfu">("points");
  const [winHan, setWinHan] = useState(2);
  const [winFu, setWinFu] = useState(30);
  const [honba, setHonba] = useState(0);
  const [drawKind, setDrawKind] = useState<DrawKind>("standard");
  const [drawTenpai, setDrawTenpai] = useState<Record<Seat, boolean>>({
    E: false,
    S: false,
    W: false,
    N: false,
  });
  const [nagashiSeat, setNagashiSeat] = useState<Seat>("E");
  const [abortDealerTenpai, setAbortDealerTenpai] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${shareId}`);
    const json = (await res.json()) as {
      session?: { title: string | null; rules_json: Rules; ended_at: string | null };
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
    const sessionTitle = json.session?.title ?? "Session";
    const sessionEndedAt = json.session?.ended_at ?? null;
    setTitle(sessionTitle);
    setEndedAt(sessionEndedAt);
    if (!isSessionEnded(sessionEndedAt)) {
      storeRecentSession(shareId, sessionTitle);
    }
    const parsedRules = parseSessionRules(json.session?.rules_json);
    const mappedEvents = (json.events ?? []).map((r) => mapEventRow(r));
    setRules(parsedRules);
    setEvents(mappedEvents);
    setHonba(deriveTableState(json.session?.rules_json, mappedEvents).honba);

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
  const tableState = useMemo(() => deriveTableState(rules, events), [rules, events]);
  const dealerSeat = tableState.dealerSeat;
  const isEnded = isSessionEnded(endedAt);
  const canEdit = Boolean(editKey);
  const canRecord = canEdit && !isEnded;
  const allSeatsAssigned = seats.every((s) => Boolean(seatPlayerId[s]));
  const shareUrl = origin ? `${origin}/s/${shareId}` : `/s/${shareId}`;
  const editUrl = canEdit ? `${shareUrl}?editKey=${encodeURIComponent(editKey ?? "")}` : null;

  async function patchSession(body: Record<string, unknown>) {
    if (!editKey) {
      setError("Editing is not enabled on this device (missing edit key).");
      return;
    }
    const res = await fetch(`/api/sessions/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-edit-key": editKey },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      session?: { title: string | null; rules_json: Rules; ended_at: string | null };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Failed to update session");
    if (json.session) {
      setTitle(json.session.title ?? "Session");
      setRules(parseSessionRules(json.session.rules_json));
      setEndedAt(json.session.ended_at ?? null);
    }
    return json.session;
  }

  async function onEndGame() {
    if (!canEdit || isEnded) return;
    const ok = window.confirm(
      "End this game? Scores stay visible but no more hands can be recorded. The game will count toward the leaderboard."
    );
    if (!ok) return;
    setError(null);
    try {
      await patchSession({ end: true });
      clearRecentSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to end game");
    }
  }

  async function onReopenGame() {
    if (!canEdit || !isEnded) return;
    const ok = window.confirm("Reopen this game for more score entry?");
    if (!ok) return;
    setError(null);
    try {
      await patchSession({ reopen: true });
      storeRecentSession(shareId, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reopen game");
    }
  }

  async function postEvent(type: string, payload: Record<string, unknown>) {
    if (!editKey) {
      setError("Editing is not enabled on this device (missing edit key).");
      return;
    }
    if (isEnded) {
      setError("This game has ended. Reopen it to record more hands.");
      return;
    }
    const res = await fetch(`/api/sessions/${shareId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-edit-key": editKey },
      body: JSON.stringify({ type, payload }),
    });
    const json = (await res.json()) as { event?: { type: string; payload_json: Record<string, unknown>; created_at: string; id: string; session_id: string }; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to add event");
    if (json.event) {
      const mapped = mapEventRow(json.event);
      setEvents((prev) => {
        const next = [...prev, mapped];
        setHonba(deriveTableState(rules, next).honba);
        return next;
      });
    }
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

  const saveSeatAssignments = useCallback(
    async (assignments: Record<Seat, string>) => {
      if (!editKey) return;
      const res = await fetch(`/api/sessions/${shareId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-key": editKey },
        body: JSON.stringify({ assignments }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Failed to save seats");
      }
    },
    [editKey, shareId]
  );

  function isPlayerTaken(playerId: string, exceptSeat: Seat) {
    if (!playerId) return false;
    return seats.some((s) => s !== exceptSeat && seatPlayerId[s] === playerId);
  }

  function onSeatPlayerChange(seat: Seat, playerId: string) {
    if (playerId && isPlayerTaken(playerId, seat)) {
      setError("That player is already at another seat. Clear that seat or choose someone else.");
      return;
    }

    const player = players.find((p) => p.id === playerId);
    const nextIds = { ...seatPlayerId, [seat]: playerId };
    const nextNames = { ...seatPlayerName, [seat]: player?.display_name ?? "" };
    setSeatPlayerId(nextIds);
    setSeatPlayerName(nextNames);
    setError(null);
    if (!canRecord) return;
    void saveSeatAssignments(nextIds).catch((e) =>
      setError(friendlySeatError(e instanceof Error ? e.message : "Failed to save seats"))
    );
  }

  function saveEditKeyFromInput() {
    const trimmed = editKeyInput.trim();
    if (!trimmed) {
      setError("Enter an edit key first.");
      return;
    }
    storeEditKey(shareId, trimmed);
    setManualEditKey(trimmed);
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
    setError(null);
    try {
      await patchSession({ title, rules_json: rules });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save rules");
    }
  }

  const winnerIsDealer = winner === dealerSeat;

  const riichiPool = useMemo(() => pendingRiichiPool(events), [events]);
  const riichiOnTable = useMemo(() => pendingRiichiBySeat(events), [events]);

  async function onDeclareRiichi(seat: Seat) {
    setError(null);
    try {
      await postEvent("riichi", { seat, value: rules.riichiStickValue });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record riichi");
    }
  }

  const hanFuPreview = useMemo(() => {
    if (winScoreMode !== "hanfu") return null;
    if (winType === "ron" && winner === fromSeat) return null;
    try {
      const scored = scoreFromHanFu({
        han: winHan,
        fu: winFu,
        winType,
        winner,
        fromSeat: winType === "ron" ? fromSeat : undefined,
        winnerIsDealer,
        dealerSeat,
      });
      const withHonba = applyHonbaToDeltas(scored.deltas, honba, rules.honbaValue, winType);
      const withRiichi =
        riichiPool > 0 ? applyRiichiSticksToWin(withHonba, winner, riichiPool) : withHonba;
      const total = withRiichi[winner] ?? scored.total;
      const noteParts = [scored.note];
      if (honba > 0) noteParts.push(`honba ${honba}`);
      if (riichiPool > 0) noteParts.push(`riichi +${riichiPool.toLocaleString()}`);
      return { ...scored, deltas: withRiichi, total, note: noteParts.join(" · ") };
    } catch {
      return null;
    }
  }, [
    winScoreMode,
    winHan,
    winFu,
    winType,
    winner,
    fromSeat,
    winnerIsDealer,
    dealerSeat,
    honba,
    rules.honbaValue,
    riichiPool,
  ]);

  function onAddWin() {
    if (winType === "ron" && winner === fromSeat) {
      setError("Winner and discarder cannot be the same seat.");
      return;
    }

    let deltas: Record<Seat, number>;
    let note: string;
    let payloadExtras: Record<string, unknown> = {
      winType,
      winner,
      fromSeat: winType === "ron" ? fromSeat : undefined,
    };

    if (winScoreMode === "hanfu") {
      try {
        const scored = scoreFromHanFu({
          han: winHan,
          fu: winFu,
          winType,
          winner,
          fromSeat: winType === "ron" ? fromSeat : undefined,
          winnerIsDealer,
          dealerSeat,
        });
        deltas = applyHonbaToDeltas(scored.deltas, honba, rules.honbaValue, winType);
        if (riichiPool > 0) {
          deltas = applyRiichiSticksToWin(deltas, winner, riichiPool);
        }
        const noteParts = [scored.note];
        if (honba > 0) noteParts.push(`honba ${honba}`);
        if (riichiPool > 0) noteParts.push(`riichi +${riichiPool.toLocaleString()}`);
        note = noteParts.join(" · ");
        payloadExtras = {
          ...payloadExtras,
          han: winHan,
          fu: winFu,
          winnerIsDealer,
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid han/fu");
        return;
      }
    } else {
      const honbaPay = honba * rules.honbaValue * (winType === "ron" ? 1 : 3);
      const handTotal = winPoints + honbaPay;
      deltas =
        winType === "ron"
          ? buildRonDeltas(winner, fromSeat, handTotal)
          : buildTsumoDeltas(winner, handTotal);
      if (riichiPool > 0) {
        deltas = applyRiichiSticksToWin(deltas, winner, riichiPool);
      }
      const noteParts = [`${winType.toUpperCase()} ${handTotal.toLocaleString()}`];
      if (honba > 0) noteParts.push(`honba ${honba}`);
      if (riichiPool > 0) noteParts.push(`riichi +${riichiPool.toLocaleString()}`);
      note = noteParts.join(" · ");
    }

    if (riichiPool > 0) {
      payloadExtras = { ...payloadExtras, riichiCollected: riichiPool };
    }

    void postEvent("win", { deltas, note, ...payloadExtras })
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }

  const drawTenpaiSeats = useMemo(
    () => seats.filter((s) => drawTenpai[s]),
    [drawTenpai]
  );
  const drawDeltas = useMemo(() => {
    if (drawKind === "nagashi_mangan") return computeNagashiManganDeltas(nagashiSeat);
    if (drawKind === "standard") return computeExhaustiveDrawDeltas(drawTenpaiSeats);
    return null;
  }, [drawKind, drawTenpaiSeats, nagashiSeat]);
  const drawPaymentPreview = useMemo(
    () =>
      formatDrawPaymentPreview(drawDeltas, seatPlayerName, seatLabel, {
        emptyMessage:
          drawKind === "standard"
            ? "All four tenpai or all four noten — no point payments."
            : "No score payments for this abort.",
      }),
    [drawDeltas, seatPlayerName, drawKind]
  );
  const drawDealerTenpai =
    drawKind === "nagashi_mangan"
      ? nagashiSeat === dealerSeat
      : drawKind === "standard"
        ? drawTenpai[dealerSeat]
        : abortDealerTenpai;

  const drawRuleHint = useMemo(() => {
    if (drawKind === "nagashi_mangan") {
      return `Nagashi mangan: ${seatLabel(nagashiSeat)} collects 8,000 from each opponent (24,000 total).`;
    }
    if (drawKind === "four_riichi") {
      return "Four riichi declared — hand aborts with no score change. Confirm whether dealer was tenpai.";
    }
    if (drawKind === "four_kans") {
      return "Four kans on the table — hand aborts with no score change. Confirm whether dealer was tenpai.";
    }
    return describeStandardDrawRule(drawTenpaiSeats.length);
  }, [drawKind, drawTenpaiSeats.length, nagashiSeat]);

  function onAddDraw() {
    const dealerTenpai = drawDealerTenpai;
    const noteParts = [
      drawKindLabel(drawKind),
      drawDeltas ? drawPaymentPreview : "No payments",
      dealerTenpai ? "dealer continues" : "dealer passes",
    ];

    void postEvent("draw", {
      drawKind,
      dealerTenpai,
      ...(drawKind === "standard" ? { tenpaiSeats: drawTenpaiSeats } : {}),
      ...(drawKind === "nagashi_mangan" ? { nagashiSeat } : {}),
      ...(drawDeltas ? { deltas: drawDeltas } : {}),
      note: noteParts.join(" · "),
    })
      .then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }

  async function onAdvanceToSouth() {
    if (rules.gameLength !== "hanchan" || tableState.roundWind !== "east") return;
    setError(null);
    try {
      await postEvent("round_advance", { roundWind: "south" });
      await patchSession({
        rules_json: { ...rules, roundWind: "south" },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to advance round");
    }
  }

  return (
    <main className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isEnded
              ? `Game ended${endedAt ? ` · ${new Date(endedAt).toLocaleString()}` : ""}`
              : canRecord
                ? "You can record hands"
                : "Viewing live scores"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {gameLengthLabel(tableState.gameLength)}
            </span>
            <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {roundWindLabel(tableState.roundWind)}
            </span>
            {honba > 0 ? (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                Honba {honba}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {canEdit && !isEnded ? (
            <button
              type="button"
              onClick={() => void onEndGame()}
              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            >
              End game
            </button>
          ) : null}
          {canEdit && isEnded ? (
            <button
              type="button"
              onClick={() => void onReopenGame()}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-800"
            >
              Reopen
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => void onClaim()}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-800"
            >
              Claim
            </button>
          ) : null}
        </div>
      </div>

      {claimStatus ? <div className="text-sm text-emerald-700 dark:text-emerald-300">{claimStatus}</div> : null}
      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      {isEnded ? (
        <div className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          This game is finished. Final scores are below. Ended games count on the{" "}
          <Link href="/leaderboard" className="font-medium underline">
            leaderboard
          </Link>
          .
        </div>
      ) : null}

      {!canEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          View-only. Ask the scorekeeper to share the editor link, or paste the edit key under{" "}
          <span className="font-medium">Share with table</span> below.
        </div>
      ) : canEdit && isEnded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          You have the edit key but this game is ended. Tap <span className="font-medium">Reopen</span> to
          record more hands.
        </div>
      ) : null}

      <section className="sticky top-[52px] z-30 -mx-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Table · dealer: {seatLabel(dealerSeat)}
            {seatPlayerName[dealerSeat] ? ` (${seatPlayerName[dealerSeat]})` : ""}
          </div>
          {canRecord && !allSeatsAssigned ? (
            <span className="text-[10px] text-amber-700 dark:text-amber-300">Assign a player to each seat</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {seats.map((s) => (
            <div
              key={s}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950 sm:px-3"
            >
              <div className="flex items-center justify-between gap-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  {seatLabel(s)}
                </div>
                {s === dealerSeat ? (
                  <span className="rounded bg-amber-200 px-1 py-0.5 text-[9px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                    Dealer
                  </span>
                ) : null}
              </div>
              {canRecord ? (
                <select
                  value={seatPlayerId[s]}
                  onChange={(e) => onSeatPlayerChange(s, e.target.value)}
                  className="mt-1 h-9 w-full truncate rounded-lg border border-zinc-200 bg-white px-1.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
                  aria-label={`Player at ${seatLabel(s)}`}
                >
                  <option value="">Choose player…</option>
                  {players.map((p) => {
                    const takenElsewhere = isPlayerTaken(p.id, s);
                    return (
                      <option key={p.id} value={p.id} disabled={takenElsewhere}>
                        {p.display_name}
                        {takenElsewhere ? " (seated elsewhere)" : ""}
                      </option>
                    );
                  })}
                </select>
              ) : seatPlayerName[s] ? (
                <div className="mt-1 truncate text-sm font-semibold">{seatPlayerName[s]}</div>
              ) : (
                <div className="mt-1 text-sm text-zinc-400">—</div>
              )}
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight">
                {totals[s].toLocaleString()}
              </div>
              {canRecord && !isEnded ? (
                <button
                  type="button"
                  disabled={riichiOnTable[s] > 0}
                  onClick={() => void onDeclareRiichi(s)}
                  title={
                    riichiOnTable[s] > 0
                      ? "Already declared riichi this hand"
                      : `Place ${rules.riichiStickValue.toLocaleString()} pt riichi stick (${seatLabel(s)})`
                  }
                  className={`mt-2 h-8 w-full rounded-lg border text-[10px] font-semibold ${
                    riichiOnTable[s] > 0
                      ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
                      : "border-amber-200/80 text-amber-900 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-950/30"
                  } disabled:opacity-100`}
                >
                  {riichiOnTable[s] > 0 ? "Riichi declared" : `Riichi −${rules.riichiStickValue.toLocaleString()}`}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {canRecord ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100/80 px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800/80">
            <label className="flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300">
              Honba
              <input
                type="number"
                min={0}
                value={honba}
                onChange={(e) => setHonba(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-14 rounded-md border border-zinc-200 bg-white px-1.5 text-center font-mono text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-950"
                aria-label="Honba sticks on table"
              />
            </label>
            <span className="hidden h-4 w-px bg-zinc-300 sm:inline dark:bg-zinc-600" aria-hidden />
            {riichiPool > 0 ? (
              <span className="rounded-md bg-amber-100 px-2 py-1 font-medium text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
                Riichi {riichiPool.toLocaleString()} on table
                <span className="ml-1 font-normal text-amber-800 dark:text-amber-200">
                  (
                  {seats
                    .filter((s) => riichiOnTable[s] > 0)
                    .map((s) => seatLabel(s))
                    .join(", ")}
                  )
                </span>
              </span>
            ) : (
              <span className="text-zinc-500">No riichi sticks — tap Riichi on a seat when declared</span>
            )}
          </div>
        ) : null}
        {canRecord && players.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            No players yet.{" "}
            <Link href="/players" className="font-medium underline">
              Add players
            </Link>{" "}
            first, then assign them to each seat.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Record hand</div>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
            {(
              [
                ["win", "Win"],
                ["draw", "Draw"],
                ["adjust", "Adjust"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRecordTab(id)}
                className={`rounded-md px-3 py-1.5 font-medium ${
                  recordTab === id
                    ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {canRecord && !allSeatsAssigned ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Assign all four seats above before recording hands (needed for the leaderboard).
          </p>
        ) : null}
        <div className="mt-3 space-y-4">
          {recordTab === "win" ? (
          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Ron / tsumo</div>
              <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setWinScoreMode("points")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    winScoreMode === "points"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Points
                </button>
                <button
                  type="button"
                  onClick={() => setWinScoreMode("hanfu")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    winScoreMode === "hanfu"
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  Han + fu
                </button>
              </div>
            </div>

            {winScoreMode === "points" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {SCORE_PRESETS.map((pts) => (
                  <button
                    key={pts}
                    type="button"
                    onClick={() => setWinPoints(pts)}
                    className={`h-9 rounded-lg border px-2 text-xs font-medium tabular-nums ${
                      winPoints === pts
                        ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                        : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    {pts.toLocaleString()}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                Standard riichi scoring from han/fu using the current dealer seat ({seatLabel(dealerSeat)}
                ). Honba and riichi sticks on the table are added to the winner (ron or tsumo).
              </p>
            )}

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                value={winType}
                onChange={(e) => setWinType(e.target.value as "ron" | "tsumo")}
                className="h-11 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="ron">Ron</option>
                <option value="tsumo">Tsumo</option>
              </select>
              {winScoreMode === "points" ? (
                <input
                  type="number"
                  value={winPoints}
                  onChange={(e) => setWinPoints(Number(e.target.value))}
                  placeholder="Hand points"
                  className="h-11 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    Han
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={winHan}
                      onChange={(e) => setWinHan(Number(e.target.value))}
                      className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="text-xs">
                    Fu {winHan >= 5 ? "(limit hand)" : ""}
                    <input
                      type="number"
                      min={20}
                      max={110}
                      step={10}
                      value={winFu}
                      disabled={winHan >= 5}
                      onChange={(e) => setWinFu(Number(e.target.value))}
                      className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                </div>
              )}
              <select
                value={winner}
                onChange={(e) => setWinner(e.target.value as Seat)}
                className="h-11 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {seats.map((s) => (
                  <option key={s} value={s}>
                    Winner: {seatOptionLabel(s, seatPlayerName[s])}
                  </option>
                ))}
              </select>
              {winType === "ron" ? (
                <select
                  value={fromSeat}
                  onChange={(e) => setFromSeat(e.target.value as Seat)}
                  className="h-11 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {seats.map((s) => (
                    <option key={s} value={s}>
                      From: {seatOptionLabel(s, seatPlayerName[s])}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>

            {winScoreMode === "hanfu" && winnerIsDealer ? (
              <p className="mt-2 text-xs text-zinc-500">Winner is dealer — dealer continues next hand.</p>
            ) : winScoreMode === "hanfu" ? (
              <p className="mt-2 text-xs text-zinc-500">Non-dealer win — dealer passes after this hand.</p>
            ) : null}

            {hanFuPreview ? (
              <div className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <span className="font-medium">Score preview:</span> {hanFuPreview.note}
              </div>
            ) : winScoreMode === "points" && riichiPool > 0 ? (
              <p className="mt-2 text-xs text-zinc-500">
                Hand points are from opponents only; add {riichiPool.toLocaleString()} riichi on win.
              </p>
            ) : winScoreMode === "hanfu" && winType === "ron" && winner === fromSeat ? (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                Winner and discarder must be different seats.
              </div>
            ) : null}
            {riichiPool > 0 ? (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                Winner collects {riichiPool.toLocaleString()} pts in riichi sticks (see table above).
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canRecord}
              onClick={onAddWin}
              className="mt-3 h-12 w-full rounded-xl bg-zinc-950 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
            >
              Record win
            </button>
          </div>
          ) : null}

          {recordTab === "draw" ? (
          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Exhaustive draw</div>
            <label className="mt-2 block text-xs">
              Draw type
              <select
                value={drawKind}
                onChange={(e) => setDrawKind(e.target.value as DrawKind)}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="standard">Standard (tenpai / noten)</option>
                <option value="four_riichi">Four riichi — abort</option>
                <option value="four_kans">Four kans — abort</option>
                <option value="nagashi_mangan">Nagashi mangan</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{drawRuleHint}</p>
            {drawKind === "standard" && drawTenpaiSeats.length > 0 && drawTenpaiSeats.length < 4 ? (
              <p className="mt-1 text-[10px] text-zinc-400">
                Standard: 3,000 pt total from noten → tenpai (not 3,000 per noten player).
              </p>
            ) : null}

            {drawKind === "standard" ? (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDrawTenpai({ E: true, S: true, W: true, N: true })
                    }
                    className="h-8 rounded-lg border border-zinc-200 px-2 text-xs font-medium dark:border-zinc-700"
                  >
                    All tenpai
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawTenpai({ E: false, S: false, W: false, N: false })}
                    className="h-8 rounded-lg border border-zinc-200 px-2 text-xs font-medium dark:border-zinc-700"
                  >
                    All noten
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawTenpai({
                        E: dealerSeat === "E",
                        S: dealerSeat === "S",
                        W: dealerSeat === "W",
                        N: dealerSeat === "N",
                      })
                    }
                    className="h-8 rounded-lg border border-zinc-200 px-2 text-xs font-medium dark:border-zinc-700"
                  >
                    Dealer only
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {seats.map((s) => (
                    <label
                      key={s}
                      className={`flex cursor-pointer flex-col rounded-lg border px-2 py-2 text-xs ${
                        drawTenpai[s]
                          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <span className="font-medium text-zinc-700 dark:text-zinc-200">
                        {seatLabel(s)}
                        {s === dealerSeat ? " · dealer" : ""}
                      </span>
                      <span className="mt-0.5 text-[10px] text-zinc-500">
                        {seatPlayerName[s] || "—"}
                      </span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={drawTenpai[s]}
                          onChange={(e) =>
                            setDrawTenpai((prev) => ({ ...prev, [s]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Tenpai
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : drawKind === "nagashi_mangan" ? (
              <label className="mt-2 block text-xs">
                Nagashi winner
                <select
                  value={nagashiSeat}
                  onChange={(e) => setNagashiSeat(e.target.value as Seat)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {seats.map((s) => (
                    <option key={s} value={s}>
                      {seatOptionLabel(s, seatPlayerName[s])}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={abortDealerTenpai}
                  onChange={(e) => setAbortDealerTenpai(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Dealer was tenpai (usually yes when four riichi)
              </label>
            )}

            <div className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <span className="font-medium">Payments:</span> {drawPaymentPreview}
              <span className="mt-1 block text-zinc-500">
                Dealer ({seatLabel(dealerSeat)}):{" "}
                {drawDealerTenpai ? "stays · honba +1" : "passes · honba +1"}
              </span>
            </div>
            <button
              type="button"
              disabled={!canRecord}
              onClick={onAddDraw}
              className="mt-3 h-11 w-full rounded-xl border border-zinc-200 text-sm font-medium dark:border-zinc-700"
            >
              Record draw
            </button>
          </div>
          ) : null}

          {recordTab === "adjust" ? (
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="text-xs font-medium">Manual score change</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Add or subtract points for each seat. Use for mistakes, chombo, or anything{" "}
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Record win</span> does not cover.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Example: East <span className="font-mono">+8000</span>, South{" "}
                <span className="font-mono">−8000</span>, others <span className="font-mono">0</span>.
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {seats.map((s) => (
                  <label key={s} className="text-center text-[10px]">
                    <span className="text-zinc-500">{seatLabel(s)}</span>
                    <span className="block text-[9px] text-zinc-400">+/− pts</span>
                    <input
                      type="number"
                      value={manualDelta[s]}
                      onChange={(e) => setManualDelta((d) => ({ ...d, [s]: Number(e.target.value) }))}
                      className="mt-0.5 h-9 w-full rounded border border-zinc-200 px-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={!canRecord}
                onClick={() =>
                  void postEvent("manual_adjustment", { deltaBySeat: manualDelta })
                    .then(() => setManualDelta({ E: 0, S: 0, W: 0, N: 0 }))
                    .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
                }
                className="mt-2 h-9 w-full rounded-lg border border-zinc-200 text-xs font-medium dark:border-zinc-800"
              >
                Apply score change
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Game rules & title</summary>
        <div className="space-y-4 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <label className="block text-xs">
            Session title
            <input
              disabled={!canRecord}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Match length
              <select
                disabled={!canRecord}
                value={rules.gameLength}
                onChange={(e) =>
                  setRules((r) => ({
                    ...r,
                    gameLength: e.target.value as Rules["gameLength"],
                    roundWind: e.target.value === "east" ? "east" : r.roundWind,
                  }))
                }
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="east">East only (tonpuu)</option>
                <option value="hanchan">East + South (hanchan)</option>
              </select>
            </label>
            {canRecord && rules.gameLength === "hanchan" && tableState.roundWind === "east" ? (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void onAdvanceToSouth()}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-medium dark:border-zinc-800"
                >
                  Start South round
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["startingPoints", "Starting"],
                ["returnPoints", "Return"],
                ["riichiStickValue", "Riichi stick"],
                ["honbaValue", "Honba each"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-xs">
                {label}
                <input
                  type="number"
                  disabled={!canRecord}
                  value={rules[key]}
                  onChange={(e) => setRules((r) => ({ ...r, [key]: Number(e.target.value) }))}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!canRecord}
            onClick={() =>
              void onSaveSessionMeta().catch((e) => setError(e instanceof Error ? e.message : "Failed"))
            }
            className="h-10 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
          >
            Save title and rules
          </button>
        </div>
      </details>

      <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Share with table</summary>
        <div className="space-y-3 border-t border-zinc-200 px-4 py-4 text-sm dark:border-zinc-800">
          <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">Viewer link (for everyone else)</div>
              <button type="button" onClick={() => void copyText("Viewer link", shareUrl)} className="text-xs underline">
                Copy
              </button>
            </div>
            <div className="mt-1 break-all font-mono text-xs">{shareUrl}</div>
          </div>
          {editUrl ? (
            <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500">Editor link (scorekeeper only)</div>
                <button type="button" onClick={() => void copyText("Editor link", editUrl)} className="text-xs underline">
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
              type="button"
              onClick={saveEditKeyFromInput}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-zinc-800"
            >
              Enable editing
            </button>
          </div>
        </div>
      </details>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-sm font-medium">Hand history</div>
          <button
            type="button"
            disabled={!canRecord || events.length === 0}
            onClick={() =>
              void onUndoLastEvent().catch((e) =>
                setError(e instanceof Error ? e.message : "Failed to undo")
              )
            }
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-medium disabled:opacity-40 dark:border-zinc-800"
          >
            Undo last
          </button>
        </div>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {[...events].reverse().map((ev, idx) => {
            const line = formatHandHistoryEntry(ev, seatPlayerName);
            return (
              <li key={idx} className="px-4 py-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-medium">{line.title}</div>
                  <div className="text-xs text-zinc-500">{new Date(ev.createdAt).toLocaleString()}</div>
                </div>
                {line.detail ? (
                  <div className="mt-1 text-zinc-600 dark:text-zinc-300">{line.detail}</div>
                ) : null}
              </li>
            );
          })}
          {events.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-300">No hands recorded yet.</li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}
