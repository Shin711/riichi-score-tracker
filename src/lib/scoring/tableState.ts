import type { Rules, Seat, SessionEvent } from "@/lib/scoring/ledger";
import { defaultRules } from "@/lib/scoring/ledger";
import { isAbortiveDrawKind } from "@/lib/scoring/draw";

export type GameLength = "east" | "hanchan";
export type RoundWind = "east" | "south";

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
    roundWind: r.roundWind === "east" || r.roundWind === "south" ? r.roundWind : base.roundWind,
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
  gameLength: GameLength;
};

function inferWinnerFromWinEvent(ev: Extract<SessionEvent, { type: "win" }>): Seat | null {
  if (ev.winner) return ev.winner;
  const seats: Seat[] = ["E", "S", "W", "N"];
  return seats.find((s) => (ev.deltas[s] ?? 0) > 0) ?? null;
}

/** Replay hand-ending events to get current dealer, honba, and round wind from saved rules. */
export function deriveTableState(rulesJson: unknown, events: SessionEvent[]): DerivedTableState {
  const rules = parseSessionRules(rulesJson);
  let dealerSeat = rules.dealerSeat;
  let honba = 0;
  let roundWind = rules.roundWind;

  for (const ev of events) {
    if (ev.type === "win") {
      const winner = inferWinnerFromWinEvent(ev);
      if (!winner) continue;
      if (winner === dealerSeat) {
        honba += 1;
      } else {
        dealerSeat = nextDealerSeat(dealerSeat);
        honba = 0;
      }
    } else if (ev.type === "draw") {
      // Honba +1 on every draw. Abortive draws always keep the dealer; exhaustive draws use tenpai renchan.
      // @see https://riichi.wiki/Abortive_draws · https://riichi.wiki/Exhaustive_draw
      honba += 1;
      const kind = ev.drawKind ?? "standard";
      if (!isAbortiveDrawKind(kind) && !ev.dealerTenpai) {
        dealerSeat = nextDealerSeat(dealerSeat);
      }
    } else if (ev.type === "round_advance" && ev.roundWind === "south") {
      roundWind = "south";
      honba = 0;
    }
  }

  return {
    dealerSeat,
    honba,
    roundWind,
    gameLength: rules.gameLength,
  };
}

export function gameLengthLabel(gameLength: GameLength): string {
  return gameLength === "east" ? "East only" : "East + South (hanchan)";
}

export function roundWindLabel(roundWind: RoundWind): string {
  return roundWind === "east" ? "East round" : "South round";
}
