import type { Seat, SessionEvent } from "@/lib/scoring/ledger";

const seats: Seat[] = ["E", "S", "W", "N"];

export type SeatNames = Record<Seat, string>;

export type HandHistoryLine = {
  title: string;
  detail: string | null;
};

function seatLabel(seat: Seat) {
  if (seat === "E") return "East";
  if (seat === "S") return "South";
  if (seat === "W") return "West";
  return "North";
}

function playerAtSeat(seat: Seat, names: SeatNames): string {
  const name = names[seat]?.trim();
  return name ? `${seatLabel(seat)} (${name})` : seatLabel(seat);
}

function formatSignedPoints(value: number) {
  const formatted = Math.abs(value).toLocaleString();
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "0";
}

function inferWinFromDeltas(deltas: Record<Seat, number>) {
  const winner = seats.find((s) => (deltas[s] ?? 0) > 0);
  if (!winner) return {};

  const total = deltas[winner] ?? 0;
  const losers = seats.filter((s) => (deltas[s] ?? 0) < 0);
  if (losers.length === 1) {
    return { winType: "ron" as const, winner, fromSeat: losers[0], total };
  }
  if (losers.length === 3) {
    return { winType: "tsumo" as const, winner, total };
  }
  return { winner, total };
}

function parseWinTypeFromNote(note?: string): "ron" | "tsumo" | undefined {
  if (!note) return undefined;
  const upper = note.toUpperCase();
  if (upper.startsWith("RON")) return "ron";
  if (upper.startsWith("TSUMO")) return "tsumo";
  return undefined;
}

export function formatHandHistoryEntry(ev: SessionEvent, names: SeatNames): HandHistoryLine {
  if (ev.type === "riichi") {
    return {
      title: "Riichi",
      detail: `${playerAtSeat(ev.seat, names)} · ${formatSignedPoints(-ev.value)} stick`,
    };
  }

  if (ev.type === "manual_adjustment") {
    const changes = seats
      .filter((s) => (ev.deltaBySeat[s] ?? 0) !== 0)
      .map((s) => `${playerAtSeat(s, names)} ${formatSignedPoints(ev.deltaBySeat[s] ?? 0)}`);
    return {
      title: "Manual score change",
      detail: changes.length > 0 ? changes.join(" · ") : (ev.note ?? null),
    };
  }

  const inferred = inferWinFromDeltas(ev.deltas);
  const winType = ev.winType ?? parseWinTypeFromNote(ev.note) ?? inferred.winType;
  const winner = ev.winner ?? inferred.winner;
  const fromSeat = ev.fromSeat ?? inferred.fromSeat;
  const total = inferred.total;

  const title = winType === "ron" ? "Ron" : winType === "tsumo" ? "Tsumo" : "Win";

  let detail: string | null = null;
  const hanFuParts: string[] = [];
  if (ev.han != null) {
    hanFuParts.push(`${ev.han} han`);
    if (ev.fu != null && ev.han < 5) hanFuParts.push(`${ev.fu} fu`);
    if (ev.winnerIsDealer) hanFuParts.push("dealer");
  }

  if (winner) {
    if (winType === "ron" && fromSeat) {
      detail = `${playerAtSeat(winner, names)} from ${playerAtSeat(fromSeat, names)}`;
    } else {
      detail = playerAtSeat(winner, names);
    }
    if (hanFuParts.length > 0) {
      detail += ` · ${hanFuParts.join(" ")}`;
    }
    if (total) {
      detail += ` · ${total.toLocaleString()} pts`;
    }
  } else if (ev.note) {
    detail = ev.note;
  } else if (hanFuParts.length > 0) {
    detail = hanFuParts.join(" ");
  }

  const honbaMatch = ev.note?.match(/honba\s+(\d+)/i);
  if (honbaMatch && detail && !detail.includes("honba")) {
    detail += ` · honba ${honbaMatch[1]}`;
  }

  return { title, detail };
}
