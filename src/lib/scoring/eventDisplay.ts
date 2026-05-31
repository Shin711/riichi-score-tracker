import { drawKindLabel } from "@/lib/scoring/draw";
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

function playerAtSeat(seat: Seat, names: SeatNames, label: (seat: Seat) => string): string {
  const name = names[seat]?.trim();
  return name ? `${label(seat)} (${name})` : label(seat);
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

export function formatHandHistoryEntry(
  ev: SessionEvent,
  names: SeatNames,
  seatWindLabel?: (seat: Seat) => string
): HandHistoryLine {
  const label = seatWindLabel ?? seatLabel;

  if (ev.type === "draw") {
    const kind = ev.drawKind ?? "standard";
    const title =
      kind === "nagashi_mangan"
        ? "Nagashi mangan"
        : kind === "four_riichi"
          ? "Four riichi (abort)"
          : kind === "four_kans"
            ? "Four kans (abort)"
            : "Exhaustive draw";

    const paymentParts =
      ev.deltas &&
      seats
        .filter((s) => (ev.deltas![s] ?? 0) !== 0)
        .map((s) => `${playerAtSeat(s, names, label)} ${formatSignedPoints(ev.deltas![s] ?? 0)}`);

    const dealerPart = ev.dealerTenpai
      ? "Dealer tenpai · dealer continues · honba +1"
      : "Dealer not tenpai · dealer passes · honba +1";

    const detailParts: string[] = [];
    if (kind !== "standard") detailParts.push(drawKindLabel(kind));
    if (ev.nagashiSeat) detailParts.push(playerAtSeat(ev.nagashiSeat, names, label));
    if (paymentParts && paymentParts.length > 0) detailParts.push(paymentParts.join(" · "));
    else if (kind === "four_riichi" || kind === "four_kans") {
      detailParts.push("No score payments");
    }
    detailParts.push(dealerPart);

    return {
      title,
      detail: detailParts.join(" · "),
    };
  }

  if (ev.type === "round_advance") {
    return {
      title: "Round change",
      detail: ev.roundWind === "south" ? "South round started" : "East round",
    };
  }

  if (ev.type === "riichi") {
    return {
      title: "Riichi",
      detail: `${playerAtSeat(ev.seat, names, label)} · ${formatSignedPoints(-ev.value)} stick`,
    };
  }

  if (ev.type === "manual_adjustment") {
    const changes = seats
      .filter((s) => (ev.deltaBySeat[s] ?? 0) !== 0)
      .map((s) => `${playerAtSeat(s, names, label)} ${formatSignedPoints(ev.deltaBySeat[s] ?? 0)}`);
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
      detail = `${playerAtSeat(winner, names, label)} from ${playerAtSeat(fromSeat, names, label)}`;
    } else {
      detail = playerAtSeat(winner, names, label);
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
  if (ev.riichiCollected && ev.riichiCollected > 0 && detail && !detail.includes("riichi")) {
    detail += ` · riichi +${ev.riichiCollected.toLocaleString()}`;
  }

  return { title, detail };
}
