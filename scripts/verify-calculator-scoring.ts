import { calculateHandScore } from "../src/lib/scoring/calculatorDisplay";
import { calculateFu, defaultFuHelperInput } from "../src/lib/scoring/fuHelper";

/** EMA / riichi.wiki score table reference values */
const cases = [
  { name: "2-30 tsumo ko", han: 2, fu: 30, winType: "tsumo" as const, dealer: false, expected: 2000 },
  { name: "2-30 ron ko", han: 2, fu: 30, winType: "ron" as const, dealer: false, expected: 2000 },
  { name: "2-20 tsumo ko pinfu", han: 2, fu: 20, winType: "tsumo" as const, dealer: false, expected: 1500 },
  { name: "2-30 ron oya", han: 2, fu: 30, winType: "ron" as const, dealer: true, expected: 2900 },
  { name: "2-30 tsumo oya", han: 2, fu: 30, winType: "tsumo" as const, dealer: true, expected: 3000 },
  { name: "3-30 tsumo ko", han: 3, fu: 30, winType: "tsumo" as const, dealer: false, expected: 4000 },
  { name: "3-40 tsumo ko", han: 3, fu: 40, winType: "tsumo" as const, dealer: false, expected: 5200 },
  { name: "3-30 ron ko", han: 3, fu: 30, winType: "ron" as const, dealer: false, expected: 3900 },
  { name: "3-30 ron oya", han: 3, fu: 30, winType: "ron" as const, dealer: true, expected: 5800 },
  { name: "4-30 ron ko", han: 4, fu: 30, winType: "ron" as const, dealer: false, expected: 7700 },
  { name: "4-30 ron ko mangan at 40fu", han: 4, fu: 40, winType: "ron" as const, dealer: false, expected: 8000 },
  { name: "5 han mangan ron ko", han: 5, fu: 30, winType: "ron" as const, dealer: false, expected: 8000 },
  { name: "1 honba 2-30 tsumo ko", han: 2, fu: 30, winType: "tsumo" as const, dealer: false, expected: 2900, honba: 1 },
];

let failed = 0;
for (const c of cases) {
  const r = calculateHandScore({
    winType: c.winType,
    winnerIsDealer: c.dealer,
    han: c.han,
    fu: c.fu,
    honba: c.honba ?? 0,
  });
  const ok = r?.total === c.expected;
  if (!ok) failed++;
  console.log(ok ? "OK  " : "FAIL", c.name, "| got", r?.total, "| expected", c.expected);
}

const pinfuTsumo = calculateFu({ ...defaultFuHelperInput("tsumo"), handShape: "pinfu" });
const closedRon40 = calculateFu({
  ...defaultFuHelperInput("ron"),
  isClosed: true,
  closedPonSimple: 1,
  waitType: "ryanmen",
});
console.log(pinfuTsumo.fu === 20 ? "OK  " : "FAIL", "pinfu tsumo fu", pinfuTsumo.fu);
console.log(closedRon40.fu === 40 ? "OK  " : "FAIL", "closed ron 1 pon fu", closedRon40.fu);

process.exit(failed > 0 ? 1 : 0);
