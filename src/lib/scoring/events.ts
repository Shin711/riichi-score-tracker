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

  const deltas = (payload.deltas ?? {}) as Record<Seat, number>;
  const note = typeof payload.note === "string" ? payload.note : undefined;
  return { type: "win", createdAt, deltas, note };
}
