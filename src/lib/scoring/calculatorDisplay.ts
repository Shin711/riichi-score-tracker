import type { Seat } from "@/lib/scoring/ledger";
import {
  applyHonbaToDeltas,
  roundFu,
  scoreFromHanFu,
  type HanFuInput,
  type WinType,
} from "@/lib/scoring/hanFu";

const HONBA_VALUE = 300;

export type CalculatorInput = {
  winType: WinType;
  winnerIsDealer: boolean;
  han: number;
  fu: number;
  honba: number;
};

export type PaymentRow = {
  label: string;
  amount: number;
};

export type CalculatorResult = {
  total: number;
  handLabel: string;
  payments: PaymentRow[];
  honbaNote: string | null;
  basicPoints: number | null;
  limitName: string | null;
};

/** Map beginner-friendly roles to fixed seats (dealer always East for calculation). */
function seatsForCalculator(winnerIsDealer: boolean): { winner: Seat; fromSeat: Seat; dealerSeat: Seat } {
  return {
    dealerSeat: "E",
    winner: winnerIsDealer ? "E" : "S",
    fromSeat: "W",
  };
}

/**
 * Standard riichi payments in plain language for beginners.
 * @see https://riichi.wiki/Scoring — EMA-style han/fu tables
 */
export function calculateHandScore(input: CalculatorInput): CalculatorResult | null {
  const han = Math.max(1, Math.floor(input.han));
  const fu = input.fu > 0 ? input.fu : 30;
  const { winner, fromSeat, dealerSeat } = seatsForCalculator(input.winnerIsDealer);

  const base: HanFuInput = {
    han,
    fu,
    winType: input.winType,
    winner,
    fromSeat: input.winType === "ron" ? fromSeat : undefined,
    winnerIsDealer: input.winnerIsDealer,
    dealerSeat,
  };

  try {
    const scored = scoreFromHanFu(base);
    const deltas =
      input.honba > 0
        ? applyHonbaToDeltas(scored.deltas, input.honba, HONBA_VALUE, input.winType)
        : scored.deltas;
    const total = deltas[winner] ?? scored.total;

    const payments: PaymentRow[] = [];
    if (input.winType === "ron") {
      payments.push({
        label: "Player who discarded your tile (ron)",
        amount: total,
      });
    } else if (input.winnerIsDealer) {
      const each = Math.abs(deltas.W || deltas.N || deltas.S);
      payments.push({ label: "Each opponent (3 players)", amount: each });
    } else {
      const dealerPays = Math.abs(deltas.E);
      const otherPays = Math.abs(deltas.W || deltas.N);
      payments.push({ label: "Dealer (East)", amount: dealerPays });
      payments.push({ label: "Each other opponent (2 players)", amount: otherPays });
    }

    const honbaNote =
      input.honba > 0
        ? input.winType === "ron"
          ? `Includes ${input.honba} honba stick${input.honba === 1 ? "" : "s"} (+${(input.honba * HONBA_VALUE).toLocaleString()} from discarder)`
          : `Includes ${input.honba} honba stick${input.honba === 1 ? "" : "s"} (+${(input.honba * HONBA_VALUE).toLocaleString()} from each payer)`
        : null;

    return {
      total,
      handLabel: scored.limitName
        ? `${han} han (${scored.limitName})`
        : `${han} han ${roundFu(fu)} fu`,
      payments,
      honbaNote,
      basicPoints: scored.basicPoints,
      limitName: scored.limitName,
    };
  } catch {
    return null;
  }
}
