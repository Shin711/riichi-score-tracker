import { roundFu, type WinType } from "@/lib/scoring/hanFu";

export type WaitType = "ryanmen" | "tanki" | "kanchan" | "penchan" | "shanpon";

export type HandShape = "normal" | "pinfu" | "chiitoitsu";

export type FuHelperInput = {
  winType: WinType;
  isClosed: boolean;
  handShape: HandShape;
  openPonSimple: number;
  openPonTerminalHonor: number;
  closedPonSimple: number;
  closedPonTerminalHonor: number;
  openKanSimple: number;
  openKanTerminalHonor: number;
  closedKanSimple: number;
  closedKanTerminalHonor: number;
  valuedPair: boolean;
  waitType: WaitType;
};

export type FuBreakdownLine = {
  label: string;
  fu: number;
};

export type FuHelperResult = {
  fu: number;
  unroundedFu: number;
  lines: FuBreakdownLine[];
  warnings: string[];
};

function meldFu(input: FuHelperInput): { total: number; lines: FuBreakdownLine[] } {
  const lines: FuBreakdownLine[] = [];
  let total = 0;

  const add = (count: number, per: number, label: string) => {
    if (count <= 0) return;
    const fu = count * per;
    total += fu;
    lines.push({ label: `${label} ×${count}`, fu });
  };

  add(input.openPonSimple, 2, "Open pon (2–8)");
  add(input.openPonTerminalHonor, 4, "Open pon (1/9/honor)");
  add(input.closedPonSimple, 4, "Closed pon (2–8)");
  add(input.closedPonTerminalHonor, 8, "Closed pon (1/9/honor)");
  add(input.openKanSimple, 8, "Open kan (2–8)");
  add(input.openKanTerminalHonor, 16, "Open kan (1/9/honor)");
  add(input.closedKanSimple, 16, "Closed kan (2–8)");
  add(input.closedKanTerminalHonor, 32, "Closed kan (1/9/honor)");

  return { total, lines };
}

/**
 * Standard riichi fu (EMA-style).
 * @see https://riichi.wiki/Fu
 */
export function calculateFu(input: FuHelperInput): FuHelperResult {
  const warnings: string[] = [];

  if (input.handShape === "chiitoitsu") {
    return {
      fu: 25,
      unroundedFu: 25,
      lines: [{ label: "Seven pairs (chiitoitsu) — fixed", fu: 25 }],
      warnings,
    };
  }

  if (input.handShape === "pinfu") {
    if (!input.isClosed) {
      warnings.push("Pinfu is normally a closed hand. Open “all chii” hands use open-pinfu rules (30 fu).");
    }
    if (input.winType === "tsumo") {
      return {
        fu: 20,
        unroundedFu: 20,
        lines: [{ label: "Pinfu + tsumo — fixed", fu: 20 }],
        warnings,
      };
    }
    return {
      fu: 30,
      unroundedFu: 30,
      lines: [{ label: "Pinfu + ron — fixed", fu: 30 }],
      warnings,
    };
  }

  const lines: FuBreakdownLine[] = [{ label: "Base (every win)", fu: 20 }];
  let fu = 20;

  if (input.isClosed && input.winType === "ron") {
    fu += 10;
    lines.push({ label: "Closed ron (+10)", fu: 10 });
  }

  const melds = meldFu(input);
  fu += melds.total;
  lines.push(...melds.lines);

  if (input.valuedPair) {
    fu += 2;
    lines.push({ label: "Valued pair (seat/round wind or dragon)", fu: 2 });
  }

  const waitFu =
    input.waitType === "tanki" || input.waitType === "kanchan" || input.waitType === "penchan" ? 2 : 0;
  if (waitFu > 0) {
    fu += waitFu;
    lines.push({ label: "Edge / middle / pair wait (+2)", fu: waitFu });
  }

  if (input.winType === "tsumo") {
    fu += 2;
    lines.push({ label: "Tsumo win (+2)", fu: 2 });
  }

  const unroundedFu = fu;

  // Open hand with no fu from melds/wait/pair → +2 “open pinfu” before rounding (kui-pinfu).
  const hasOpenMelds =
    input.openPonSimple +
      input.openPonTerminalHonor +
      input.openKanSimple +
      input.openKanTerminalHonor >
    0;
  if (
    !input.isClosed &&
    !hasOpenMelds &&
    !input.valuedPair &&
    waitFu === 0 &&
    melds.total === 0
  ) {
    fu += 2;
    lines.push({ label: "Open hand minimum (+2)", fu: 2 });
  }

  if (input.isClosed && input.openPonSimple + input.openPonTerminalHonor + input.openKanSimple + input.openKanTerminalHonor > 0) {
    warnings.push("A closed hand usually has no open melds — check open pon/kan counts.");
  }

  const rounded = roundFu(fu);
  if (rounded !== fu) {
    lines.push({ label: `Round up (${fu} → ${rounded})`, fu: 0 });
  }

  return { fu: rounded, unroundedFu, lines, warnings };
}

export function defaultFuHelperInput(winType: WinType): FuHelperInput {
  return {
    winType,
    isClosed: true,
    handShape: "normal",
    openPonSimple: 0,
    openPonTerminalHonor: 0,
    closedPonSimple: 0,
    closedPonTerminalHonor: 0,
    openKanSimple: 0,
    openKanTerminalHonor: 0,
    closedKanSimple: 0,
    closedKanTerminalHonor: 0,
    valuedPair: false,
    waitType: "ryanmen",
  };
}
