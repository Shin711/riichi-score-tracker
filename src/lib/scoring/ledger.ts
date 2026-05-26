export type Seat = "E" | "S" | "W" | "N";

export type Rules = {
  startingPoints: number;
  returnPoints: number;
  riichiStickValue: number;
  honbaValue: number;
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
    };

export function defaultRules(): Rules {
  return {
    startingPoints: 25000,
    returnPoints: 30000,
    riichiStickValue: 1000,
    honbaValue: 300,
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

  for (const ev of events) {
    if (ev.type === "manual_adjustment") {
      for (const seat of seats) totals[seat] += ev.deltaBySeat[seat] ?? 0;
    } else if (ev.type === "riichi") {
      totals[ev.seat] -= ev.value;
    } else if (ev.type === "win") {
      for (const seat of seats) totals[seat] += ev.deltas[seat] ?? 0;
    }
  }

  return totals;
}

