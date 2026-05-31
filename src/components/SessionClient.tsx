"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Rules, Seat, SessionEvent } from "@/lib/scoring/ledger";
import {
  buildRonDeltas,
  buildTsumoDeltas,
  applyRiichiSticksToWin,
  computeTotals,
  pendingRiichiBySeat,
  pendingRiichiPool,
  riichiDeclaredThisHand,
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
  seatWindForDealer,
} from "@/lib/scoring/tableState";
import { clearEditKey, storeEditKey } from "@/lib/editKey";
import { clearRecentSession, storeRecentSession } from "@/lib/recentSession";
import { isSessionEnded } from "@/lib/session/status";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useEditKey, useOrigin } from "@/hooks/useClientStorage";

const seats: Seat[] = ["E", "S", "W", "N"];
const SCORE_PRESETS = [3900, 5200, 7700, 8000, 12000];

function seatOptionLabel(seat: Seat, playerName: string, dealerSeat: Seat) {
  const wind = seatWindForDealer(seat, dealerSeat);
  return playerName ? `${wind} (${playerName})` : wind;
}

function friendlySeatError(message: string) {
  if (message.includes("session_players_session_id_player_id_key")) {
    return "Each player can only sit in one seat. Pick a different player for this wind.";
  }
  return message;
}

function TableCompactBar({
  visible,
  dealerSeat,
  seatPlayerName,
  totals,
  honba,
  riichiPool,
}: {
  visible: boolean;
  dealerSeat: Seat;
  seatPlayerName: Record<Seat, string>;
  totals: Record<Seat, number>;
  honba: number;
  riichiPool: number;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={`shell-bar fixed inset-x-0 top-[52px] z-40 hidden border-b shadow-md transition-[transform,opacity] duration-200 sm:block ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto max-w-5xl px-4 py-2">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted">
          <span>
            Dealer: East
            {seatPlayerName[dealerSeat] ? ` (${seatPlayerName[dealerSeat]})` : ""}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {honba > 0 ? <span className="chip-amber py-0">Honba {honba}</span> : null}
            {riichiPool > 0 ? (
              <span className="chip-amber py-0">Riichi {riichiPool.toLocaleString()}</span>
            ) : null}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {seats.map((s) => (
            <div
              key={s}
              className={`rounded-lg border px-1.5 py-1 text-center ${
                s === dealerSeat ? "compact-score-dealer" : "compact-score-seat"
              }`}
            >
              <div className="compact-score-label truncate text-[9px] font-semibold uppercase">
                {seatWindForDealer(s, dealerSeat).slice(0, 1)}
                {seatPlayerName[s] ? ` · ${seatPlayerName[s].split(" ")[0]}` : ""}
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums leading-tight">
                {totals[s].toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type DrawTenpaiPreset = "all_tenpai" | "all_noten" | "dealer_only";

type RecordActionKind = "win" | "draw" | "adjust";

type RecordActionState = {
  phase: "idle" | "loading" | "success";
  kind?: RecordActionKind;
};

function drawTenpaiMatchesPreset(
  drawTenpai: Record<Seat, boolean>,
  preset: DrawTenpaiPreset,
  dealerSeat: Seat
) {
  if (preset === "all_tenpai") return seats.every((s) => drawTenpai[s]);
  if (preset === "all_noten") return seats.every((s) => !drawTenpai[s]);
  return seats.every((s) => drawTenpai[s] === (s === dealerSeat));
}

function RecordSubmitButton({
  kind,
  label,
  loadingLabel,
  successLabel,
  recordAction,
  disabled,
  onClick,
}: {
  kind: RecordActionKind;
  label: string;
  loadingLabel: string;
  successLabel: string;
  recordAction: RecordActionState;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  const isLoading = recordAction.phase === "loading" && recordAction.kind === kind;
  const isSuccess = recordAction.phase === "success" && recordAction.kind === kind;

  return (
    <button
      type="button"
      disabled={disabled || recordAction.phase === "loading"}
      onClick={() => void onClick()}
      className={`mt-3 h-12 w-full rounded-xl btn-primary disabled:opacity-40 ${
        isLoading ? "record-btn-loading" : ""
      } ${isSuccess ? "record-btn-success" : ""}`}
    >
      {isLoading ? loadingLabel : isSuccess ? successLabel : label}
    </button>
  );
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
  const [drawTenpaiPreset, setDrawTenpaiPreset] = useState<DrawTenpaiPreset | null>(null);
  const [drawPresetMessage, setDrawPresetMessage] = useState<string | null>(null);
  const [recordAction, setRecordAction] = useState<RecordActionState>({ phase: "idle" });
  const [nagashiSeat, setNagashiSeat] = useState<Seat>("E");
  const [abortDealerTenpai, setAbortDealerTenpai] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sessionRemoved, setSessionRemoved] = useState(false);

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

  async function onRemoveGame() {
    if (!editKey || !isEnded || removing) return;
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch(`/api/sessions/${shareId}`, {
        method: "DELETE",
        headers: { "x-edit-key": editKey },
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to remove game");
      clearRecentSession();
      clearEditKey(shareId);
      setSessionRemoved(true);
      setConfirmRemove(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove game");
    } finally {
      setRemoving(false);
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
  const riichiDeclared = useMemo(() => riichiDeclaredThisHand(events), [events]);

  const tableSectionRef = useRef<HTMLElement>(null);
  const [compactBarVisible, setCompactBarVisible] = useState(false);

  useEffect(() => {
    const el = tableSectionRef.current;
    if (!el) return;

    const mq = window.matchMedia("(min-width: 640px)");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!mq.matches) {
          setCompactBarVisible(false);
          return;
        }
        setCompactBarVisible(!entry.isIntersecting);
      },
      { root: null, rootMargin: "-52px 0px 0px 0px", threshold: 0 }
    );

    observer.observe(el);

    const onMqChange = () => {
      if (!mq.matches) setCompactBarVisible(false);
    };
    mq.addEventListener("change", onMqChange);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", onMqChange);
    };
  }, []);

  useEffect(() => {
    if (!drawPresetMessage) return;
    const timer = window.setTimeout(() => setDrawPresetMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [drawPresetMessage]);

  function applyDrawTenpaiPreset(preset: DrawTenpaiPreset, message: string) {
    if (preset === "all_tenpai") {
      setDrawTenpai({ E: true, S: true, W: true, N: true });
    } else if (preset === "all_noten") {
      setDrawTenpai({ E: false, S: false, W: false, N: false });
    } else {
      setDrawTenpai({
        E: dealerSeat === "E",
        S: dealerSeat === "S",
        W: dealerSeat === "W",
        N: dealerSeat === "N",
      });
    }
    setDrawTenpaiPreset(preset);
    setDrawPresetMessage(message);
  }

  function updateDrawTenpaiSeat(seat: Seat, tenpai: boolean) {
    setDrawTenpai((prev) => {
      const next = { ...prev, [seat]: tenpai };
      const matched = (["all_tenpai", "all_noten", "dealer_only"] as const).find((preset) =>
        drawTenpaiMatchesPreset(next, preset, dealerSeat)
      );
      setDrawTenpaiPreset(matched ?? null);
      return next;
    });
  }

  async function runRecordAction(kind: RecordActionKind, action: () => Promise<void>) {
    if (recordAction.phase === "loading") return;
    setRecordAction({ phase: "loading", kind });
    setError(null);
    try {
      await action();
      setRecordAction({ phase: "success", kind });
      window.setTimeout(() => setRecordAction({ phase: "idle" }), 1200);
    } catch (e) {
      setRecordAction({ phase: "idle" });
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

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

  async function onAddWin() {
    if (winType === "ron" && winner === fromSeat) {
      throw new Error("Winner and discarder cannot be the same seat.");
    }

    let deltas: Record<Seat, number>;
    let note: string;
    let payloadExtras: Record<string, unknown> = {
      winType,
      winner,
      fromSeat: winType === "ron" ? fromSeat : undefined,
    };

    if (winScoreMode === "hanfu") {
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

    await postEvent("win", { deltas, note, ...payloadExtras });
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
      formatDrawPaymentPreview(drawDeltas, seatPlayerName, (s) => seatWindForDealer(s, dealerSeat), {
        emptyMessage:
          drawKind === "standard"
            ? "All four tenpai or all four noten — no point payments."
            : "No score payments for this abort.",
      }),
    [drawDeltas, seatPlayerName, drawKind, dealerSeat]
  );
  const drawDealerTenpai =
    drawKind === "nagashi_mangan"
      ? nagashiSeat === dealerSeat
      : drawKind === "standard"
        ? drawTenpai[dealerSeat]
        : abortDealerTenpai;

  const drawRuleHint = useMemo(() => {
    if (drawKind === "nagashi_mangan") {
      return `Nagashi mangan: ${seatWindForDealer(nagashiSeat, dealerSeat)} collects 8,000 from each opponent (24,000 total).`;
    }
    if (drawKind === "four_riichi") {
      return "Four riichi declared — hand aborts with no score change. Confirm whether dealer was tenpai.";
    }
    if (drawKind === "four_kans") {
      return "Four kans on the table — hand aborts with no score change. Confirm whether dealer was tenpai.";
    }
    return describeStandardDrawRule(drawTenpaiSeats.length);
  }, [drawKind, drawTenpaiSeats.length, nagashiSeat, dealerSeat]);

  async function onAddDraw() {
    const dealerTenpai = drawDealerTenpai;
    const noteParts = [
      drawKindLabel(drawKind),
      drawDeltas ? drawPaymentPreview : "No payments",
      dealerTenpai ? "dealer continues" : "dealer passes",
    ];

    await postEvent("draw", {
      drawKind,
      dealerTenpai,
      ...(drawKind === "standard" ? { tenpaiSeats: drawTenpaiSeats } : {}),
      ...(drawKind === "nagashi_mangan" ? { nagashiSeat } : {}),
      ...(drawDeltas ? { deltas: drawDeltas } : {}),
      note: noteParts.join(" · "),
    });
  }

  async function onApplyManualAdjustment() {
    await postEvent("manual_adjustment", { deltaBySeat: manualDelta });
    setManualDelta({ E: 0, S: 0, W: 0, N: 0 });
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

  if (sessionRemoved) {
    return (
      <main className="space-y-4">
        <div className="card p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-club-ink">Game removed</h1>
          <p className="mt-2 text-sm text-muted">
            This session and its scores were deleted. It will no longer appear on the leaderboard.
          </p>
          <Link href="/" className="btn-primary mt-5 inline-flex h-11 px-6">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-club-ink sm:text-2xl">{title}</h1>
          <p className="mt-0.5 text-xs text-subtle">
            {isEnded
              ? `Game ended${endedAt ? ` · ${new Date(endedAt).toLocaleString()}` : ""}`
              : canRecord
                ? "You can record hands"
                : "Viewing live scores"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="chip-neutral">
              {gameLengthLabel(tableState.gameLength)}
            </span>
            <span className="chip-neutral">
              {roundWindLabel(tableState.roundWind)}
            </span>
            {honba > 0 ? (
              <span className="chip-amber">
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
              className="btn-secondary px-2 py-1 text-xs"
            >
              Reopen
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => void onClaim()}
              className="btn-secondary px-2 py-1 text-xs"
            >
              Claim
            </button>
          ) : null}
        </div>
      </div>

      {claimStatus ? <div className="text-sm text-emerald-700 dark:text-emerald-300">{claimStatus}</div> : null}
      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      {isEnded ? (
        <div className="rounded-xl border border-club-border bg-club-surface px-3 py-2 text-sm text-club-ink">
          This game is finished. Final scores are below. Ended games count on the{" "}
          <Link href="/leaderboard" className="font-medium underline">
            leaderboard
          </Link>
          .
          {canEdit ? (
            <div className="mt-3 border-t border-club-border pt-3">
              {confirmRemove ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/40">
                  <p className="text-xs leading-5 text-red-900 dark:text-red-200">
                    Remove this game permanently? It will leave the leaderboard for that month. This
                    cannot be undone.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => setConfirmRemove(false)}
                      className="btn-secondary h-9 px-3 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => void onRemoveGame()}
                      className="h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {removing ? "Removing…" : "Yes, remove game"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="text-xs font-medium text-red-600 underline dark:text-red-400"
                >
                  Remove from leaderboard
                </button>
              )}
            </div>
          ) : null}
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

      <TableCompactBar
        visible={compactBarVisible}
        dealerSeat={dealerSeat}
        seatPlayerName={seatPlayerName}
        totals={totals}
        honba={honba}
        riichiPool={riichiPool}
      />

      <section
        ref={tableSectionRef}
        className="card sticky top-[52px] z-30 -mx-1 p-3 shadow-md sm:static sm:z-auto sm:shadow-sm"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted">
            Table · dealer: East
            {seatPlayerName[dealerSeat] ? ` (${seatPlayerName[dealerSeat]})` : ""}
          </div>
          {canRecord && !allSeatsAssigned ? (
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">Assign a player to each seat</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {seats.map((s) => (
            <div key={s} className="seat-card">
              <div className="flex items-center justify-between gap-1">
                <div className="seat-label">{seatWindForDealer(s, dealerSeat)}</div>
                {s === dealerSeat ? (
                  <span className="chip-amber py-0 text-[9px]">Dealer</span>
                ) : null}
              </div>
              {canRecord ? (
                <select
                  value={seatPlayerId[s]}
                  onChange={(e) => onSeatPlayerChange(s, e.target.value)}
                  className="field mt-1 h-9 w-full truncate px-1.5 text-sm font-medium"
                  aria-label={`Player at ${seatWindForDealer(s, dealerSeat)}`}
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
                <div className="mt-1 truncate text-sm font-semibold text-club-ink">{seatPlayerName[s]}</div>
              ) : (
                <div className="mt-1 text-sm text-muted">—</div>
              )}
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-club-ink">
                {totals[s].toLocaleString()}
              </div>
              {canRecord && !isEnded ? (
                <button
                  type="button"
                  disabled={riichiDeclared[s]}
                  onClick={() => void onDeclareRiichi(s)}
                  title={
                    riichiDeclared[s]
                      ? "Already declared riichi this hand"
                      : `Place ${rules.riichiStickValue.toLocaleString()} pt riichi stick (${seatWindForDealer(s, dealerSeat)})`
                  }
                  className={`disabled:opacity-100 ${riichiDeclared[s] ? "btn-riichi-active" : "btn-riichi"}`}
                >
                  {riichiDeclared[s] ? "Riichi declared" : `Riichi −${rules.riichiStickValue.toLocaleString()}`}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {canRecord ? (
          <div className="session-subbar">
            <label className="flex items-center gap-1.5 font-semibold text-club-ink">
              Honba
              <input
                type="number"
                min={0}
                value={honba}
                onChange={(e) => setHonba(Math.max(0, Number(e.target.value) || 0))}
                className="field h-8 w-14 px-1.5 text-center font-mono text-sm tabular-nums"
                aria-label="Honba sticks on table"
              />
            </label>
            <span className="hidden h-4 w-px bg-club-border sm:inline" aria-hidden />
            {riichiPool > 0 ? (
              <span className="chip-amber py-1 text-xs">
                Riichi {riichiPool.toLocaleString()} on table
                <span className="ml-1 font-normal opacity-80">
                  (
                  {seats
                    .filter((s) => riichiOnTable[s] > 0)
                    .map((s) => seatWindForDealer(s, dealerSeat))
                    .join(", ")}
                  )
                </span>
              </span>
            ) : (
              <span className="text-muted">No riichi sticks — tap Riichi on a seat when declared</span>
            )}
          </div>
        ) : null}
        {canRecord && players.length === 0 ? (
          <p className="mt-2 text-xs text-subtle">
            No players yet.{" "}
            <Link href="/players" className="font-medium underline">
              Add players
            </Link>{" "}
            first, then assign them to each seat.
          </p>
        ) : null}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-club-ink">Record hand</div>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-stone-600">
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
                    ? "bg-club-red text-white"
                    : "text-muted"
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
          <div className="rounded-xl border border-zinc-200 p-3 dark:border-stone-600">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted">Ron / tsumo</div>
              <div className="flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-stone-600">
                <button
                  type="button"
                  onClick={() => setWinScoreMode("points")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    winScoreMode === "points"
                      ? "bg-club-red text-white"
                      : "text-muted"
                  }`}
                >
                  Points
                </button>
                <button
                  type="button"
                  onClick={() => setWinScoreMode("hanfu")}
                  className={`rounded-md px-2 py-1 font-medium ${
                    winScoreMode === "hanfu"
                      ? "bg-club-red text-white"
                      : "text-muted"
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
                        ? "border-club-red bg-club-red text-white"
                        : "border-stone-200 dark:border-stone-600"
                    }`}
                  >
                    {pts.toLocaleString()}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-subtle">
                Standard riichi scoring from han/fu using the current dealer (East wind
                {seatPlayerName[dealerSeat] ? ` · ${seatPlayerName[dealerSeat]}` : ""}). Honba and
                riichi sticks on the table are added to the winner (ron or tsumo).
              </p>
            )}

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                value={winType}
                onChange={(e) => setWinType(e.target.value as "ron" | "tsumo")}
                className="h-11 rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
                  className="h-11 rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
                      className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
                      className="mt-1 h-11 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                    />
                  </label>
                </div>
              )}
              <select
                value={winner}
                onChange={(e) => setWinner(e.target.value as Seat)}
                className="h-11 rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              >
                {seats.map((s) => (
                  <option key={s} value={s}>
                    Winner: {seatOptionLabel(s, seatPlayerName[s], dealerSeat)}
                  </option>
                ))}
              </select>
              {winType === "ron" ? (
                <select
                  value={fromSeat}
                  onChange={(e) => setFromSeat(e.target.value as Seat)}
                  className="h-11 rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                >
                  {seats.map((s) => (
                    <option key={s} value={s}>
                      From: {seatOptionLabel(s, seatPlayerName[s], dealerSeat)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>

            {winScoreMode === "hanfu" && winnerIsDealer ? (
              <p className="mt-2 text-xs text-subtle">Winner is dealer — dealer continues next hand.</p>
            ) : winScoreMode === "hanfu" ? (
              <p className="mt-2 text-xs text-subtle">Non-dealer win — dealer passes after this hand.</p>
            ) : null}

            {hanFuPreview ? (
              <div className="notice-inset mt-2 px-3">
                <span className="font-medium">Score preview:</span> {hanFuPreview.note}
              </div>
            ) : winScoreMode === "points" && riichiPool > 0 ? (
              <p className="mt-2 text-xs text-subtle">
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
            <RecordSubmitButton
              kind="win"
              label="Record win"
              loadingLabel="Recording win…"
              successLabel="Win recorded ✓"
              recordAction={recordAction}
              disabled={!canRecord}
              onClick={() => runRecordAction("win", onAddWin)}
            />
          </div>
          ) : null}

          {recordTab === "draw" ? (
          <div className="rounded-xl border border-zinc-200 p-3 dark:border-stone-600">
            <div className="text-xs font-medium text-muted">Exhaustive draw</div>
            <label className="mt-2 block text-xs">
              Draw type
              <select
                value={drawKind}
                onChange={(e) => setDrawKind(e.target.value as DrawKind)}
                className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              >
                <option value="standard">Standard (tenpai / noten)</option>
                <option value="four_riichi">Four riichi — abort</option>
                <option value="four_kans">Four kans — abort</option>
                <option value="nagashi_mangan">Nagashi mangan</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-relaxed text-subtle">{drawRuleHint}</p>
            {drawKind === "standard" && drawTenpaiSeats.length > 0 && drawTenpaiSeats.length < 4 ? (
              <p className="mt-1 text-[10px] text-subtle">
                Standard: 3,000 pt total from noten → tenpai (not 3,000 per noten player).
              </p>
            ) : null}

            {drawKind === "standard" ? (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyDrawTenpaiPreset(
                        "all_tenpai",
                        "All seats set to tenpai — no point payments on this draw."
                      )
                    }
                    className={`chip-preset ${
                      drawTenpaiPreset === "all_tenpai" ? "chip-preset-active" : ""
                    }`}
                  >
                    All tenpai
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyDrawTenpaiPreset(
                        "all_noten",
                        "All seats set to noten — no point payments on this draw."
                      )
                    }
                    className={`chip-preset ${
                      drawTenpaiPreset === "all_noten" ? "chip-preset-active" : ""
                    }`}
                  >
                    All noten
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyDrawTenpaiPreset(
                        "dealer_only",
                        "Only East marked tenpai — others pay 1,000 each (3,000 total)."
                      )
                    }
                    className={`chip-preset ${
                      drawTenpaiPreset === "dealer_only" ? "chip-preset-active" : ""
                    }`}
                  >
                    Dealer only
                  </button>
                </div>
                {drawPresetMessage ? (
                  <p className="notice-inset mt-2" role="status">
                    {drawPresetMessage}
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {seats.map((s) => (
                    <label
                      key={s}
                      className={`draw-seat-card ${
                        drawTenpai[s]
                          ? "draw-seat-card--tenpai"
                          : drawTenpaiPreset === "all_noten"
                            ? "draw-seat-card--noten"
                            : ""
                      }`}
                    >
                      <span className="draw-seat-card-label">
                        {seatWindForDealer(s, dealerSeat)}
                        {s === dealerSeat ? " · dealer" : ""}
                      </span>
                      <span className="draw-seat-card-subtle">
                        {seatPlayerName[s] || "—"}
                      </span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={drawTenpai[s]}
                          onChange={(e) => updateDrawTenpaiSeat(s, e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        {drawTenpai[s] ? "Tenpai" : "Noten"}
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
                  className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                >
                  {seats.map((s) => (
                    <option key={s} value={s}>
                      {seatOptionLabel(s, seatPlayerName[s], dealerSeat)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={abortDealerTenpai}
                  onChange={(e) => setAbortDealerTenpai(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Dealer was tenpai (usually yes when four riichi)
              </label>
            )}

            <div className="notice-inset mt-2 px-3">
              <span className="font-medium">Payments:</span> {drawPaymentPreview}
              <span className="notice-inset-subtle mt-1 block">
                Dealer (East):{" "}
                {drawDealerTenpai ? "stays · honba +1" : "passes · honba +1"}
              </span>
            </div>
            <RecordSubmitButton
              kind="draw"
              label="Record draw"
              loadingLabel="Recording draw…"
              successLabel="Draw recorded ✓"
              recordAction={recordAction}
              disabled={!canRecord}
              onClick={() => runRecordAction("draw", onAddDraw)}
            />
          </div>
          ) : null}

          {recordTab === "adjust" ? (
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-stone-600">
              <div className="text-xs font-medium">Manual score change</div>
              <p className="mt-1 text-xs leading-relaxed text-subtle">
                Add or subtract points for each seat. Use for mistakes, chombo, or anything{" "}
                <span className="font-medium text-muted">Record win</span> does not cover.
              </p>
              <p className="mt-1 text-xs text-subtle">
                Example: East <span className="font-mono">+8000</span>, South{" "}
                <span className="font-mono">−8000</span>, others <span className="font-mono">0</span>.
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {seats.map((s) => (
                  <label key={s} className="text-center text-[10px]">
                    <span className="text-subtle">{seatWindForDealer(s, dealerSeat)}</span>
                    <span className="block text-[9px] text-subtle">+/− pts</span>
                    <input
                      type="number"
                      value={manualDelta[s]}
                      onChange={(e) => setManualDelta((d) => ({ ...d, [s]: Number(e.target.value) }))}
                      className={`field mt-0.5 h-9 w-full px-1 text-xs tabular-nums ${
                        manualDelta[s] !== 0
                          ? "border-club-red ring-1 ring-club-red/25"
                          : ""
                      }`}
                    />
                  </label>
                ))}
              </div>
              <RecordSubmitButton
                kind="adjust"
                label="Apply score change"
                loadingLabel="Applying…"
                successLabel="Applied ✓"
                recordAction={recordAction}
                disabled={!canRecord}
                onClick={() => runRecordAction("adjust", onApplyManualAdjustment)}
              />
            </div>
          ) : null}
        </div>
      </section>

      <details className="rounded-2xl border border-stone-200 bg-club-surface shadow-sm dark:border-stone-600 dark:bg-stone-800">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Game rules & title</summary>
        <div className="space-y-4 border-t border-zinc-200 px-4 py-4 dark:border-stone-600">
          <label className="block text-xs">
            Session title
            <input
              disabled={!canRecord}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
                className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-medium dark:border-stone-600"
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
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
            className="h-10 rounded-lg btn-primary px-3 text-sm font-medium disabled:opacity-40"
          >
            Save title and rules
          </button>
        </div>
      </details>

      <details className="rounded-2xl border border-stone-200 bg-club-surface shadow-sm dark:border-stone-600 dark:bg-stone-800">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Share with table</summary>
        <div className="space-y-3 border-t border-zinc-200 px-4 py-4 text-sm dark:border-stone-600">
          <div className="rounded-lg border border-zinc-200 p-2 dark:border-stone-600">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-subtle">Viewer link (for everyone else)</div>
              <button type="button" onClick={() => void copyText("Viewer link", shareUrl)} className="text-xs underline">
                Copy
              </button>
            </div>
            <div className="mt-1 break-all font-mono text-xs">{shareUrl}</div>
          </div>
          {editUrl ? (
            <div className="rounded-lg border border-zinc-200 p-2 dark:border-stone-600">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-subtle">Editor link (scorekeeper only)</div>
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
              className="h-10 flex-1 rounded-lg border border-stone-200 bg-club-surface px-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
            />
            <button
              type="button"
              onClick={saveEditKeyFromInput}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-stone-600"
            >
              Enable editing
            </button>
          </div>
        </div>
      </details>

      <div className="rounded-2xl border border-stone-200 bg-club-surface shadow-sm dark:border-stone-600 dark:bg-stone-800">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-stone-600">
          <div className="text-sm font-medium">Hand history</div>
          <button
            type="button"
            disabled={!canRecord || events.length === 0}
            onClick={() =>
              void onUndoLastEvent().catch((e) =>
                setError(e instanceof Error ? e.message : "Failed to undo")
              )
            }
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-medium disabled:opacity-40 dark:border-stone-600"
          >
            Undo last
          </button>
        </div>
        <ul className="divide-y divide-stone-200 dark:divide-stone-600">
          {[...events].reverse().map((ev, revIdx) => {
            const eventIndex = events.length - 1 - revIdx;
            const dealerAtEvent = deriveTableState(rules, events.slice(0, eventIndex)).dealerSeat;
            const line = formatHandHistoryEntry(ev, seatPlayerName, (s) =>
              seatWindForDealer(s, dealerAtEvent)
            );
            return (
              <li key={eventIndex} className="px-4 py-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-medium">{line.title}</div>
                  <div className="text-xs text-subtle">{new Date(ev.createdAt).toLocaleString()}</div>
                </div>
                {line.detail ? (
                  <div className="mt-1 text-muted">{line.detail}</div>
                ) : null}
              </li>
            );
          })}
          {events.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">No hands recorded yet.</li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}
