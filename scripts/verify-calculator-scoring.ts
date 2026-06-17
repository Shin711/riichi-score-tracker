import {
  calculateHandScore,
  HAND_SCENARIOS,
  scoreScenario,
} from "../src/lib/scoring/calculatorDisplay";
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
  // Honba: ron = +300 per stick from discarder; tsumo = +100 from each player (+300 total).
  { name: "1 honba 2-30 ron ko", han: 2, fu: 30, winType: "ron" as const, dealer: false, expected: 2300, honba: 1 },
  { name: "1 honba 2-30 tsumo ko", han: 2, fu: 30, winType: "tsumo" as const, dealer: false, expected: 2300, honba: 1 },
  { name: "2 honba 2-30 tsumo ko", han: 2, fu: 30, winType: "tsumo" as const, dealer: false, expected: 2600, honba: 2 },
  // Chiitoitsu is fixed 25 fu (not rounded to 30).
  { name: "chiitoitsu 2-25 ron ko", han: 2, fu: 25, winType: "ron" as const, dealer: false, expected: 1600 },
  { name: "chiitoitsu 3-25 ron ko", han: 3, fu: 25, winType: "ron" as const, dealer: false, expected: 3200 },
  { name: "chiitoitsu 3-25 tsumo ko", han: 3, fu: 25, winType: "tsumo" as const, dealer: false, expected: 3200 },
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

// Scenario presets must include menzen tsumo on self-draw and use correct fu.
type ScenarioCase = {
  id: string;
  winType: "ron" | "tsumo";
  dealer: boolean;
  expected: number;
};
const scenarioCases: ScenarioCase[] = [
  { id: "riichi", winType: "ron", dealer: false, expected: 1300 }, // 1 han 40 fu
  { id: "riichi", winType: "tsumo", dealer: false, expected: 2000 }, // 2 han 30 fu (riichi+tsumo)
  { id: "riichi-pinfu", winType: "ron", dealer: false, expected: 2000 }, // 2 han 30 fu
  { id: "riichi-pinfu", winType: "tsumo", dealer: false, expected: 2700 }, // 3 han 20 fu (riichi+pinfu+tsumo)
  { id: "riichi-pinfu", winType: "tsumo", dealer: true, expected: 3900 }, // 1300 all
  { id: "riichi-tanyao", winType: "ron", dealer: false, expected: 2600 }, // 2 han 40 fu
  { id: "riichi-tanyao", winType: "tsumo", dealer: false, expected: 4000 }, // 3 han 30 fu
  { id: "riichi-pinfu-tanyao", winType: "ron", dealer: false, expected: 3900 }, // 3 han 30 fu
  { id: "riichi-pinfu-tanyao", winType: "tsumo", dealer: false, expected: 5200 }, // 4 han 20 fu
  { id: "mangan", winType: "ron", dealer: false, expected: 8000 },
  { id: "mangan", winType: "tsumo", dealer: true, expected: 12000 },
  { id: "yakuman", winType: "ron", dealer: false, expected: 32000 },
];
for (const c of scenarioCases) {
  const scenario = HAND_SCENARIOS.find((s) => s.id === c.id)!;
  const r = scoreScenario(scenario, c.winType, c.dealer, 0);
  const ok = r?.total === c.expected;
  if (!ok) failed++;
  console.log(
    ok ? "OK  " : "FAIL",
    `scenario ${c.id} ${c.winType}${c.dealer ? " oya" : ""}`,
    "| got",
    r?.total,
    "| expected",
    c.expected
  );
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
