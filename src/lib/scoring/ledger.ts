import type { DrawKind } from "@/lib/scoring/draw";

export type Seat = "E" | "S" | "W" | "N";

export type GameLength = "east" | "hanchan";
export type RoundWind = "east" | "south";

export type Rules = {
  startingPoints: number;
  returnPoints: number;
  riichiStickValue: number;
  honbaValue: number;
  /** East-only (tonpuu) vs full hanchan. */
  gameLength: GameLength;
  /** Current 場風 — South only applies when gameLength is hanchan. */
  roundWind: RoundWind;
  /** Which seat is currently dealer (場家). */
  dealerSeat: Seat;
};

export type SessionEvent =
  | {
      type: "manual_adjustment";
      createdAt: string;
      deltaBySeat: Record<Seat, number>;
      note?: string;
    }
  | {
      type: "riichi";
      createdAt: string;
      seat: Seat;
      value: number; // usually 1000
    }
  | {
      type: "win";
      createdAt: string;
      deltas: Record<Seat, number>;
      note?: string;
      winType?: "ron" | "tsumo";
      winner?: Seat;
      fromSeat?: Seat;
      han?: number;
      fu?: number;
      winnerIsDealer?: boolean;
      /** Riichi sticks on the table collected by this winner (already in deltas when set). */
      riichiCollected?: number;
    }
  | {
      type: "draw";
      createdAt: string;
      dealerTenpai: boolean;
      drawKind?: DrawKind;
      tenpaiSeats?: Seat[];
      nagashiSeat?: Seat;
      deltas?: Record<Seat, number>;
      note?: string;
    }
  | {
      type: "round_advance";
      createdAt: string;
      roundWind: RoundWind;
    };

export function defaultRules(): Rules {
  return {
    startingPoints: 25000,
    returnPoints: 30000,
    riichiStickValue: 1000,
    honbaValue: 300,
    gameLength: "hanchan",
    roundWind: "east",
    dealerSeat: "E",
  };
}

export function buildRonDeltas(winner: Seat, from: Seat, total: number): Record<Seat, number> {
  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  deltas[winner] = total;
  deltas[from] = -total;
  return deltas;
}

/** Split tsumo payment evenly across the three losers (MVP helper). */
export function buildTsumoDeltas(winner: Seat, total: number, seats: Seat[] = ["E", "S", "W", "N"]): Record<Seat, number> {
  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  const losers = seats.filter((s) => s !== winner);
  const perLoser = Math.floor(total / losers.length);
  let paid = 0;
  for (const seat of losers) {
    deltas[seat] = -perLoser;
    paid += perLoser;
  }
  deltas[winner] = paid;
  return deltas;
}

export function assertZeroSum(deltas: Record<Seat, number>, seats: Seat[] = ["E", "S", "W", "N"]) {
  const sum = seats.reduce((acc, s) => acc + (deltas[s] ?? 0), 0);
  if (sum !== 0) {
    throw new Error(`Deltas must sum to 0 (got ${sum}).`);
  }
}

const allSeats: Seat[] = ["E", "S", "W", "N"];

export function inferWinWinner(ev: Extract<SessionEvent, { type: "win" }>): Seat | null {
  if (ev.winner) return ev.winner;
  return allSeats.find((s) => (ev.deltas[s] ?? 0) > 0) ?? null;
}

/**
 * Riichi bets on the table since the last win (declarations are −value; winner collects on win).
 * Sticks carry over exhaustive draws until the next win.
 * @see https://riichi.wiki/Riichi
 */
export function pendingRiichiPool(events: SessionEvent[]): number {
  let pool = 0;
  for (const ev of events) {
    if (ev.type === "riichi") pool += ev.value;
    else if (ev.type === "win") pool = 0;
  }
  return pool;
}

/** Riichi sticks on the table per seat since the last win (for pool attribution in UI). */
export function pendingRiichiBySeat(events: SessionEvent[]): Record<Seat, number> {
  const bySeat: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  for (const ev of events) {
    if (ev.type === "riichi") {
      bySeat[ev.seat] += ev.value;
    } else if (ev.type === "win") {
      for (const seat of allSeats) bySeat[seat] = 0;
    }
  }
  return bySeat;
}

/** Events after the last hand-ending win or draw — start of the current hand. */
export function handEventsStartIndex(events: SessionEvent[]): number {
  let start = 0;
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === "win" || events[i].type === "draw") {
      start = i + 1;
    }
  }
  return start;
}

/**
 * Whether each seat declared riichi in the current unfinished hand.
 * Resets after win or exhaustive/abortive draw so a new hand can declare again
 * while sticks from prior hands remain on the table until collected on win.
 */
export function riichiDeclaredThisHand(events: SessionEvent[]): Record<Seat, boolean> {
  const start = handEventsStartIndex(events);
  const declared: Record<Seat, boolean> = { E: false, S: false, W: false, N: false };
  for (let i = start; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === "riichi") declared[ev.seat] = true;
  }
  return declared;
}

/** Credit pending riichi sticks to the winner (already deducted from declarers on riichi events). */
export function applyRiichiSticksToWin(
  deltas: Record<Seat, number>,
  winner: Seat,
  pool: number
): Record<Seat, number> {
  if (pool <= 0) return deltas;
  return { ...deltas, [winner]: (deltas[winner] ?? 0) + pool };
}

export function computeTotals(
  seats: Seat[],
  rules: Rules,
  events: SessionEvent[]
): Record<Seat, number> {
  const totals: Record<Seat, number> = {
    E: rules.startingPoints,
    S: rules.startingPoints,
    W: rules.startingPoints,
    N: rules.startingPoints,
  };

  let riichiPool = 0;

  for (const ev of events) {
    if (ev.type === "manual_adjustment") {
      for (const seat of seats) totals[seat] += ev.deltaBySeat[seat] ?? 0;
    } else if (ev.type === "riichi") {
      totals[ev.seat] -= ev.value;
      riichiPool += ev.value;
    } else if (ev.type === "win") {
      for (const seat of seats) totals[seat] += ev.deltas[seat] ?? 0;
      const collected = ev.riichiCollected ?? 0;
      if (collected > 0) {
        riichiPool = 0;
      } else {
        const winner = inferWinWinner(ev);
        if (winner && riichiPool > 0) {
          totals[winner] += riichiPool;
        }
        riichiPool = 0;
      }
    } else if (ev.type === "draw" && ev.deltas) {
      for (const seat of seats) totals[seat] += ev.deltas[seat] ?? 0;
    }
  }

  return totals;
}

