import type { Seat } from "@/lib/scoring/ledger";

export type WinType = "ron" | "tsumo";

export type HanFuInput = {
  han: number;
  fu: number;
  winType: WinType;
  winner: Seat;
  fromSeat?: Seat;
  /** Winner is the dealer (East seat when using default dealer). */
  winnerIsDealer: boolean;
  /** Seat that is dealer for tsumo payments. Defaults to East. */
  dealerSeat?: Seat;
};

export type HanFuScore = {
  deltas: Record<Seat, number>;
  /** Total points the winner gains (ron payment or tsumo collection). */
  total: number;
  basicPoints: number | null;
  limitName: string | null;
  note: string;
};

const seats: Seat[] = ["E", "S", "W", "N"];

function roundUp100(value: number) {
  return Math.ceil(value / 100) * 100;
}

export function roundFu(fu: number) {
  return Math.max(20, Math.ceil(fu / 10) * 10);
}

function limitTier(han: number): 5 | 6 | 8 | 11 | 13 {
  if (han >= 13) return 13;
  if (han >= 11) return 11;
  if (han >= 8) return 8;
  if (han >= 6) return 6;
  return 5;
}

function isManganByHanFu(han: number, fu: number) {
  const roundedFu = roundFu(fu);
  return han >= 5 || (han === 4 && roundedFu >= 40) || (han === 3 && roundedFu >= 70);
}

function limitRonPoints(tier: 5 | 6 | 8 | 11 | 13, winnerIsDealer: boolean) {
  const table = winnerIsDealer
    ? ({ 5: 12000, 6: 18000, 8: 24000, 11: 36000, 13: 48000 } as const)
    : ({ 5: 8000, 6: 12000, 8: 16000, 11: 24000, 13: 32000 } as const);
  return table[tier];
}

/** Per-opponent payment for dealer-winner tsumo (all three pay the same). */
function limitTsumoEachDealerWinner(tier: 5 | 6 | 8 | 11 | 13) {
  const table = { 5: 4000, 6: 6000, 8: 8000, 11: 12000, 13: 16000 } as const;
  return table[tier];
}

/** Non-dealer winner tsumo: dealer pays / others pay. */
function limitTsumoSplitKo(tier: 5 | 6 | 8 | 11 | 13) {
  const table = {
    5: { dealer: 4000, other: 2000 },
    6: { dealer: 6000, other: 3000 },
    8: { dealer: 8000, other: 4000 },
    11: { dealer: 12000, other: 6000 },
    13: { dealer: 16000, other: 8000 },
  } as const;
  return table[tier];
}

function cappedBasePoints(han: number, fu: number): number {
  const roundedFu = roundFu(fu);
  const raw = roundedFu * 2 ** (han + 2);
  return han <= 4 && raw > 2000 ? 2000 : raw;
}

function buildTsumoDeltas(
  winner: Seat,
  cappedBase: number,
  winnerIsDealer: boolean,
  dealerSeat: Seat
): Record<Seat, number> {
  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  let collected = 0;

  for (const seat of seats) {
    if (seat === winner) continue;
    let payment: number;
    if (winnerIsDealer) {
      payment = roundUp100(cappedBase * 2);
    } else if (seat === dealerSeat) {
      payment = roundUp100(cappedBase * 2);
    } else {
      payment = roundUp100(cappedBase);
    }
    deltas[seat] = -payment;
    collected += payment;
  }
  deltas[winner] = collected;
  return deltas;
}

function buildLimitTsumoDeltas(
  winner: Seat,
  tier: 5 | 6 | 8 | 11 | 13,
  winnerIsDealer: boolean,
  dealerSeat: Seat
): Record<Seat, number> {
  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  let collected = 0;

  if (winnerIsDealer) {
    const each = limitTsumoEachDealerWinner(tier);
    for (const seat of seats) {
      if (seat === winner) continue;
      deltas[seat] = -each;
      collected += each;
    }
  } else {
    const split = limitTsumoSplitKo(tier);
    for (const seat of seats) {
      if (seat === winner) continue;
      const payment = seat === dealerSeat ? split.dealer : split.other;
      deltas[seat] = -payment;
      collected += payment;
    }
  }
  deltas[winner] = collected;
  return deltas;
}

function limitLabel(tier: 5 | 6 | 8 | 11 | 13) {
  if (tier === 13) return "Yakuman";
  if (tier === 11) return "Sanbaiman";
  if (tier === 8) return "Baiman";
  if (tier === 6) return "Haneman";
  return "Mangan";
}

export function scoreFromHanFu(input: HanFuInput): HanFuScore {
  const han = Math.max(1, Math.floor(input.han));
  const fu = input.fu > 0 ? input.fu : 30;
  const dealerSeat = input.dealerSeat ?? "E";
  const winnerIsDealer = input.winnerIsDealer || input.winner === dealerSeat;
  const roundedFu = roundFu(fu);

  let deltas: Record<Seat, number>;
  let total: number;
  let basicPoints: number | null = null;
  let limitName: string | null = null;

  if (isManganByHanFu(han, fu)) {
    const tier = limitTier(han);
    limitName = limitLabel(tier);
    if (input.winType === "ron") {
      if (!input.fromSeat) throw new Error("Ron requires a discarder seat.");
      total = limitRonPoints(tier, winnerIsDealer);
      deltas = { E: 0, S: 0, W: 0, N: 0 };
      deltas[input.winner] = total;
      deltas[input.fromSeat] = -total;
    } else {
      deltas = buildLimitTsumoDeltas(input.winner, tier, winnerIsDealer, dealerSeat);
      total = deltas[input.winner];
    }
  } else {
    const cappedBase = cappedBasePoints(han, fu);
    basicPoints = roundUp100(cappedBase);
    if (input.winType === "ron") {
      if (!input.fromSeat) throw new Error("Ron requires a discarder seat.");
      const mult = winnerIsDealer ? 6 : 4;
      total = roundUp100(cappedBase * mult);
      deltas = { E: 0, S: 0, W: 0, N: 0 };
      deltas[input.winner] = total;
      deltas[input.fromSeat] = -total;
    } else {
      deltas = buildTsumoDeltas(input.winner, cappedBase, winnerIsDealer, dealerSeat);
      total = deltas[input.winner];
    }
  }

  const hanFuLabel = limitName
    ? `${han} han (${limitName})`
    : `${han} han ${roundedFu} fu`;
  const winLabel = input.winType === "ron" ? "Ron" : "Tsumo";
  const note = `${winLabel} · ${hanFuLabel} · ${total.toLocaleString()} pts`;

  return { deltas, total, basicPoints, limitName, note };
}

/** Add honba stick payments on top of scored deltas. */
export function applyHonbaToDeltas(
  deltas: Record<Seat, number>,
  honba: number,
  honbaValue: number,
  winType: WinType
): Record<Seat, number> {
  if (honba <= 0) return deltas;
  const next = { ...deltas };
  const pay = honba * honbaValue;

  if (winType === "ron") {
    const winner = seats.find((s) => next[s] > 0);
    const loser = seats.find((s) => next[s] < 0);
    if (winner && loser) {
      next[winner] += pay;
      next[loser] -= pay;
    }
    return next;
  }

  const winner = seats.find((s) => next[s] > 0);
  if (!winner) return next;
  let extra = 0;
  for (const seat of seats) {
    if (seat !== winner && next[seat] < 0) {
      next[seat] -= pay;
      extra += pay;
    }
  }
  next[winner] += extra;
  return next;
}
