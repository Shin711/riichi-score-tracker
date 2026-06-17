import type { Seat } from "@/lib/scoring/ledger";
import {
  applyHonbaToDeltas,
  roundFu,
  scoreFromHanFu,
  type HanFuInput,
  type WinType,
} from "@/lib/scoring/hanFu";

export const CALCULATOR_HONBA_VALUE = 300;

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

export type HandScenario = {
  id: string;
  label: string;
  hint?: string;
  /** Fixed han for limit hands (mangan and above); fu is ignored. */
  fixedHan?: number;
  /** Closed yaku han EXCLUDING menzen tsumo (which is added automatically on self-draw). */
  closedYakuHan?: number;
  /** Pinfu shape: fu is 20 on tsumo, 30 on ron. */
  isPinfu?: boolean;
};

/**
 * Common closed (riichi) hands at the table. Han/fu are derived per win type so
 * self-draws correctly include menzen tsumo, and pinfu uses its fixed fu.
 */
export const HAND_SCENARIOS: HandScenario[] = [
  { id: "riichi", label: "Riichi only", hint: "No other yaku or dora", closedYakuHan: 1 },
  { id: "riichi-pinfu", label: "Riichi + pinfu", hint: "All sequences, no-fu wait", closedYakuHan: 2, isPinfu: true },
  { id: "riichi-tanyao", label: "Riichi + tanyao", hint: "All simples (2–8)", closedYakuHan: 2 },
  {
    id: "riichi-pinfu-tanyao",
    label: "Riichi + pinfu + tanyao",
    hint: "Very common closed hand",
    closedYakuHan: 3,
    isPinfu: true,
  },
  { id: "mangan", label: "Mangan", hint: "5 han, or 4 han 40+ fu", fixedHan: 5 },
  { id: "haneman", label: "Haneman", hint: "6–7 han", fixedHan: 6 },
  { id: "baiman", label: "Baiman", hint: "8–10 han", fixedHan: 8 },
  { id: "yakuman", label: "Yakuman", hint: "13 han / special hand", fixedHan: 13 },
];

/**
 * Resolve a scenario to concrete han/fu for the given win type.
 * Riichi-based hands are always closed, so a self-draw adds menzen tsumo (+1 han).
 */
export function resolveScenarioHanFu(scenario: HandScenario, winType: WinType): { han: number; fu: number } {
  if (scenario.fixedHan != null) {
    return { han: scenario.fixedHan, fu: 30 };
  }
  const isTsumo = winType === "tsumo";
  const han = (scenario.closedYakuHan ?? 1) + (isTsumo ? 1 : 0);
  let fu: number;
  if (scenario.isPinfu) {
    fu = isTsumo ? 20 : 30;
  } else {
    // Non-pinfu closed hand: closed ron is 20+10+≥2 → 40; closed tsumo is 20+2+≥2 → 30.
    fu = isTsumo ? 30 : 40;
  }
  return { han, fu };
}

/** Mahjong Soul–style totals for quick ron picks (non-dealer). */
export const RON_POINT_PRESETS = [1300, 2000, 2600, 3900, 5200, 7700, 8000, 12000, 16000, 32000] as const;

function honbaNote(winType: WinType, honba: number): string | null {
  if (honba <= 0) return null;
  const total = honba * CALCULATOR_HONBA_VALUE;
  const sticks = `${honba} honba stick${honba === 1 ? "" : "s"}`;
  return winType === "ron"
    ? `Includes ${sticks} (+${total.toLocaleString()} from the discarder)`
    : `Includes ${sticks} (+${total.toLocaleString()} total — ${(honba * 100).toLocaleString()} from each player)`;
}

/** Map beginner-friendly roles to fixed seats (dealer always East for calculation). */
function seatsForCalculator(winnerIsDealer: boolean): { winner: Seat; fromSeat: Seat; dealerSeat: Seat } {
  return {
    dealerSeat: "E",
    winner: winnerIsDealer ? "E" : "S",
    fromSeat: "W",
  };
}

function buildResultFromScored(
  scored: ReturnType<typeof scoreFromHanFu>,
  input: {
    winType: WinType;
    winnerIsDealer: boolean;
    han: number;
    fu: number;
    honba: number;
    handLabel?: string;
  }
): CalculatorResult {
  const { winner } = seatsForCalculator(input.winnerIsDealer);
  const deltas =
    input.honba > 0
      ? applyHonbaToDeltas(scored.deltas, input.honba, CALCULATOR_HONBA_VALUE, input.winType)
      : scored.deltas;
  const total = deltas[winner] ?? scored.total;

  const payments: PaymentRow[] = [];
  if (input.winType === "ron") {
    payments.push({
      label: "Player who dealt in pays",
      amount: total,
    });
  } else if (input.winnerIsDealer) {
    const each = Math.abs(deltas.W || deltas.N || deltas.S);
    payments.push({ label: "Each of the 3 players pays", amount: each });
  } else {
    const dealerPays = Math.abs(deltas.E);
    const otherPays = Math.abs(deltas.W || deltas.N);
    payments.push({ label: "Dealer pays", amount: dealerPays });
    payments.push({ label: "Each other player pays", amount: otherPays });
  }

  return {
    total,
    handLabel:
      input.handLabel ??
      (scored.limitName ? `${input.han} han (${scored.limitName})` : `${input.han} han ${roundFu(input.fu)} fu`),
    payments,
    honbaNote: honbaNote(input.winType, input.honba),
    basicPoints: scored.basicPoints,
    limitName: scored.limitName,
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
    return buildResultFromScored(scored, { ...input, han, fu });
  } catch {
    return null;
  }
}

/** Ron win with a known total (e.g. from Mahjong Soul score screen). */
export function calculateRonPointsScore(points: number, honba: number): CalculatorResult {
  const base = Math.max(0, Math.round(points));
  const honbaExtra = honba * CALCULATOR_HONBA_VALUE;
  const total = base + honbaExtra;
  return {
    total,
    handLabel: `${base.toLocaleString()} pts`,
    payments: [{ label: "Discarder pays", amount: total }],
    honbaNote: honbaNote("ron", honba),
    basicPoints: null,
    limitName: null,
  };
}

export function scoreScenario(
  scenario: HandScenario,
  winType: WinType,
  winnerIsDealer: boolean,
  honba = 0
): CalculatorResult | null {
  const { han, fu } = resolveScenarioHanFu(scenario, winType);
  return calculateHandScore({ winType, winnerIsDealer, han, fu, honba });
}

export function previewScenarioTotal(
  scenario: HandScenario,
  winType: WinType,
  winnerIsDealer: boolean,
  honba = 0
): number | null {
  return scoreScenario(scenario, winType, winnerIsDealer, honba)?.total ?? null;
}
