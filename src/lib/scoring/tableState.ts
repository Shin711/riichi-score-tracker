import type { Rules, Seat, SessionEvent } from "@/lib/scoring/ledger";
import { defaultRules } from "@/lib/scoring/ledger";
import { isAbortiveDrawKind } from "@/lib/scoring/draw";

export type GameLength = "east" | "hanchan";
export type RoundWind = "east" | "south" | "west";

const seatOrder: Seat[] = ["E", "S", "W", "N"];

const seatWindLabels = ["East", "South", "West", "North"] as const;

export function nextDealerSeat(current: Seat): Seat {
  const index = seatOrder.indexOf(current);
  return seatOrder[(index + 1) % seatOrder.length];
}

/**
 * Seat wind (自风) relative to the current dealer — dealer is always East.
 * Fixed chair positions (E/S/W/N in data) rotate winds as the dealer passes.
 */
export function seatWindForDealer(seat: Seat, dealerSeat: Seat): string {
  const dealerIndex = seatOrder.indexOf(dealerSeat);
  const seatIndex = seatOrder.indexOf(seat);
  const offset = (seatIndex - dealerIndex + seatOrder.length) % seatOrder.length;
  return seatWindLabels[offset];
}

/** Seats in counter-clockwise wind order starting from the dealer (East wind). */
export function seatsInWindOrder(dealerSeat: Seat): Seat[] {
  const start = seatOrder.indexOf(dealerSeat);
  return seatOrder.map((_, i) => seatOrder[(start + i) % seatOrder.length]);
}

export function parseSessionRules(rulesJson: unknown): Rules {
  const base = defaultRules();
  if (!rulesJson || typeof rulesJson !== "object") return base;
  const r = rulesJson as Partial<Rules>;
  return {
    startingPoints:
      typeof r.startingPoints === "number" ? r.startingPoints : base.startingPoints,
    returnPoints: typeof r.returnPoints === "number" ? r.returnPoints : base.returnPoints,
    riichiStickValue:
      typeof r.riichiStickValue === "number" ? r.riichiStickValue : base.riichiStickValue,
    honbaValue: typeof r.honbaValue === "number" ? r.honbaValue : base.honbaValue,
    gameLength: r.gameLength === "east" || r.gameLength === "hanchan" ? r.gameLength : base.gameLength,
    roundWind:
      r.roundWind === "east" || r.roundWind === "south" || r.roundWind === "west"
        ? r.roundWind
        : base.roundWind,
    dealerSeat:
      r.dealerSeat === "E" || r.dealerSeat === "S" || r.dealerSeat === "W" || r.dealerSeat === "N"
        ? r.dealerSeat
        : base.dealerSeat,
  };
}

export type DerivedTableState = {
  dealerSeat: Seat;
  honba: number;
  roundWind: RoundWind;
  handNumber: 1 | 2 | 3 | 4;
  /** True when hanchan reaches South 4 completion with 30k+ and should end by rule. */
  ruleEnded: boolean;
  gameLength: GameLength;
};

function inferWinnerFromWinEvent(ev: Extract<SessionEvent, { type: "win" }>): Seat | null {
  if (ev.winner) return ev.winner;
  const seats: Seat[] = ["E", "S", "W", "N"];
  return seats.find((s) => (ev.deltas[s] ?? 0) > 0) ?? null;
}

function advanceDealerAndRound(state: {
  dealerSeat: Seat;
  roundWind: RoundWind;
  handNumber: 1 | 2 | 3 | 4;
  gameLength: GameLength;
  topScore: number;
  returnPoints: number;
}) {
  const nextDealer = nextDealerSeat(state.dealerSeat);
  let nextRoundWind = state.roundWind;
  let nextHandNumber: 1 | 2 | 3 | 4 = state.handNumber;
  let ruleEnded = false;

  if (state.roundWind === "east") {
    if (state.handNumber < 4) {
      nextHandNumber = (state.handNumber + 1) as 1 | 2 | 3 | 4;
    } else if (state.gameLength === "hanchan") {
      // Auto transition East 4 -> South 1 once dealer rotates to the next hand.
      nextRoundWind = "south";
      nextHandNumber = 1;
    }
  } else if (state.roundWind === "south") {
    if (state.handNumber < 4) {
      nextHandNumber = (state.handNumber + 1) as 1 | 2 | 3 | 4;
    } else if (state.topScore >= state.returnPoints) {
      // Oorasu dealer pass with 30k+ ends the game.
      ruleEnded = true;
      nextRoundWind = "south";
      nextHandNumber = 4;
    } else {
      // No one reached return points at South 4 dealer pass -> continue to West 1.
      nextRoundWind = "west";
      nextHandNumber = 1;
    }
  } else {
    // West continuation: once someone reaches return points and dealer passes, end the game.
    if (state.topScore >= state.returnPoints) {
      ruleEnded = true;
      nextRoundWind = "west";
      nextHandNumber = state.handNumber;
    } else {
      // Continue West round labeling (West 1..4 -> West 1..).
      nextHandNumber = state.handNumber < 4 ? ((state.handNumber + 1) as 1 | 2 | 3 | 4) : 1;
    }
  }

  return { dealerSeat: nextDealer, roundWind: nextRoundWind, handNumber: nextHandNumber, ruleEnded };
}

/** Replay hand-ending events to get current dealer, honba, and round wind from saved rules. */
export function deriveTableState(rulesJson: unknown, events: SessionEvent[]): DerivedTableState {
  const rules = parseSessionRules(rulesJson);
  const gameLength = rules.gameLength;
  const returnPoints = rules.returnPoints;
  let dealerSeat = rules.dealerSeat;
  let honba = 0;
  let roundWind = rules.roundWind;
  let handNumber = handNumberForDealerSeat(rules.dealerSeat);
  let ruleEnded = false;
  const totals: Record<Seat, number> = {
    E: rules.startingPoints,
    S: rules.startingPoints,
    W: rules.startingPoints,
    N: rules.startingPoints,
  };

  for (const ev of events) {
    if (ev.type === "manual_adjustment") {
      for (const seat of seatOrder) totals[seat] += ev.deltaBySeat[seat] ?? 0;
      continue;
    }
    if (ev.type === "riichi") {
      totals[ev.seat] -= ev.value;
      continue;
    }

    if (ev.type === "win") {
      for (const seat of seatOrder) totals[seat] += ev.deltas[seat] ?? 0;
      const winner = inferWinnerFromWinEvent(ev);
      if (!winner) continue;
      if (winner === dealerSeat) {
        honba += 1;
      } else {
        const topScore = Math.max(...seatOrder.map((seat) => totals[seat] ?? 0));
        const next = advanceDealerAndRound({
          dealerSeat,
          roundWind,
          handNumber,
          gameLength,
          topScore,
          returnPoints,
        });
        dealerSeat = next.dealerSeat;
        roundWind = next.roundWind;
        handNumber = next.handNumber;
        ruleEnded = ruleEnded || next.ruleEnded;
        honba = 0;
      }
    } else if (ev.type === "draw") {
      if (ev.deltas) {
        for (const seat of seatOrder) totals[seat] += ev.deltas[seat] ?? 0;
      }
      // Honba +1 on every draw. Abortive draws always keep the dealer; exhaustive draws use tenpai renchan.
      // @see https://riichi.wiki/Abortive_draws · https://riichi.wiki/Exhaustive_draw
      honba += 1;
      const kind = ev.drawKind ?? "standard";
      if (!isAbortiveDrawKind(kind) && !ev.dealerTenpai) {
        const topScore = Math.max(...seatOrder.map((seat) => totals[seat] ?? 0));
        const next = advanceDealerAndRound({
          dealerSeat,
          roundWind,
          handNumber,
          gameLength,
          topScore,
          returnPoints,
        });
        dealerSeat = next.dealerSeat;
        roundWind = next.roundWind;
        handNumber = next.handNumber;
        ruleEnded = ruleEnded || next.ruleEnded;
      }
    } else if (ev.type === "round_advance" && ev.roundWind === "south") {
      roundWind = "south";
      handNumber = 1;
      honba = 0;
    }
  }

  return {
    dealerSeat,
    honba,
    roundWind,
    handNumber,
    ruleEnded,
    gameLength,
  };
}

export function gameLengthLabel(gameLength: GameLength): string {
  return gameLength === "east" ? "East only" : "East + South (hanchan)";
}

export function roundWindLabel(roundWind: RoundWind): string {
  if (roundWind === "east") return "East round";
  if (roundWind === "south") return "South round";
  return "West round";
}

/** Current hand index within the round (1-4), based on dealer seat progression. */
export function handNumberForDealerSeat(dealerSeat: Seat): 1 | 2 | 3 | 4 {
  const index = seatOrder.indexOf(dealerSeat);
  return (index + 1) as 1 | 2 | 3 | 4;
}

/** Human-readable hand label, e.g. "East 1" or "South 4". */
export function roundHandLabel(roundWind: RoundWind, handNumber: 1 | 2 | 3 | 4): string {
  const wind = roundWind === "east" ? "East" : roundWind === "south" ? "South" : "West";
  return `${wind} ${handNumber}`;
}
