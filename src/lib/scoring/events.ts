import type { EventRow } from "@/lib/db/types";
import type { Seat, SessionEvent } from "@/lib/scoring/ledger";

function asSeat(value: unknown): Seat | null {
  if (value === "E" || value === "S" || value === "W" || value === "N") return value;
  return null;
}

export function mapEventRow(row: EventRow): SessionEvent {
  const payload = row.payload_json ?? {};
  const createdAt = row.created_at;

  if (row.type === "riichi") {
    const seat = asSeat(payload.seat);
    const value = typeof payload.value === "number" ? payload.value : 1000;
    return { type: "riichi", createdAt, seat: seat ?? "E", value };
  }

  if (row.type === "manual_adjustment") {
    const deltaBySeat = (payload.deltaBySeat ?? {}) as Record<Seat, number>;
    const note = typeof payload.note === "string" ? payload.note : undefined;
    return { type: "manual_adjustment", createdAt, deltaBySeat, note };
  }

  if (row.type === "draw") {
    const dealerTenpai = payload.dealerTenpai === true;
    const note = typeof payload.note === "string" ? payload.note : undefined;
    const drawKind =
      payload.drawKind === "four_riichi" ||
      payload.drawKind === "four_kans" ||
      payload.drawKind === "nagashi_mangan"
        ? payload.drawKind
        : "standard";
    const tenpaiSeats = (Array.isArray(payload.tenpaiSeats) ? payload.tenpaiSeats : [])
      .map((s) => asSeat(s))
      .filter((s): s is Seat => s !== null);
    const nagashiSeat = asSeat(payload.nagashiSeat) ?? undefined;
    const rawDeltas = payload.deltas;
    const deltas =
      rawDeltas && typeof rawDeltas === "object"
        ? ({
            E: Number((rawDeltas as Record<string, number>).E) || 0,
            S: Number((rawDeltas as Record<string, number>).S) || 0,
            W: Number((rawDeltas as Record<string, number>).W) || 0,
            N: Number((rawDeltas as Record<string, number>).N) || 0,
          } as Record<Seat, number>)
        : undefined;
    return {
      type: "draw",
      createdAt,
      dealerTenpai,
      drawKind,
      tenpaiSeats,
      nagashiSeat,
      deltas,
      note,
    };
  }

  if (row.type === "round_advance") {
    const roundWind = payload.roundWind === "south" ? "south" : "east";
    return { type: "round_advance", createdAt, roundWind };
  }

  const deltas = (payload.deltas ?? {}) as Record<Seat, number>;
  const note = typeof payload.note === "string" ? payload.note : undefined;
  const winType =
    payload.winType === "ron" || payload.winType === "tsumo" ? payload.winType : undefined;
  const winner = asSeat(payload.winner) ?? undefined;
  const fromSeat = asSeat(payload.fromSeat) ?? undefined;
  const han = typeof payload.han === "number" ? payload.han : undefined;
  const fu = typeof payload.fu === "number" ? payload.fu : undefined;
  const winnerIsDealer = payload.winnerIsDealer === true;
  const riichiCollected =
    typeof payload.riichiCollected === "number" && payload.riichiCollected > 0
      ? payload.riichiCollected
      : undefined;
  return {
    type: "win",
    createdAt,
    deltas,
    note,
    winType,
    winner,
    fromSeat,
    han,
    fu,
    winnerIsDealer,
    riichiCollected,
  };
}
