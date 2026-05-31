/**
 * Scenario checks against standard riichi rules (EMA-style).
 * Run: npx tsx scripts/verify-session-rules.ts
 */
import { computeExhaustiveDrawDeltas, computeNagashiManganDeltas } from "../src/lib/scoring/draw";
import {
  applyHonbaToDeltas,
  buildTsumoDeltasFromWinnerTotal,
  scoreFromHanFu,
} from "../src/lib/scoring/hanFu";
import {
  buildRonDeltas,
  assertZeroSum,
  defaultRules,
  handEventsStartIndex,
  pendingRiichiPool,
  riichiDeclaredThisHand,
  type SessionEvent,
} from "../src/lib/scoring/ledger";
import { deriveTableState } from "../src/lib/scoring/tableState";

function ok(label: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}

const rules = defaultRules();

// Dealer rotation & honba
{
  const events: SessionEvent[] = [
    { type: "win", createdAt: "1", winner: "S", winType: "ron", fromSeat: "E", deltas: buildRonDeltas("S", "E", 8000) },
    { type: "draw", createdAt: "2", dealerTenpai: true, drawKind: "standard" },
    { type: "draw", createdAt: "3", dealerTenpai: false, drawKind: "standard" },
  ];
  const state = deriveTableState(rules, events);
  ok("non-dealer win passes dealer to S", deriveTableState(rules, events.slice(0, 1)).dealerSeat === "S");
  ok("dealer tenpai draw keeps dealer at S", deriveTableState(rules, events.slice(0, 2)).dealerSeat === "S");
  ok("dealer noten draw passes dealer to W", state.dealerSeat === "W" && state.honba === 2);
}

// Draw payments
{
  const d1 = computeExhaustiveDrawDeltas(["E"]);
  ok("1 tenpai: E +3000", d1?.E === 3000 && d1?.S === -1000);
  assertZeroSum(d1!);
  ok("all noten no payments", computeExhaustiveDrawDeltas([]) === null);
}

// Nagashi mangan tsumo split
{
  const ko = computeNagashiManganDeltas("S", "E");
  ok("ko nagashi winner gets 8000", ko.S === 8000 && ko.E === -4000 && ko.W === -2000 && ko.N === -2000);
  assertZeroSum(ko);
  const oya = computeNagashiManganDeltas("E", "E");
  ok("oya nagashi winner gets 12000", oya.E === 12000 && oya.S === -4000);
  assertZeroSum(oya);
}

// Points tsumo split matches han/fu
{
  const scoredKo = scoreFromHanFu({
    han: 2,
    fu: 30,
    winType: "tsumo",
    winner: "S",
    winnerIsDealer: false,
    dealerSeat: "E",
  });
  const d = buildTsumoDeltasFromWinnerTotal("S", scoredKo.total, false, "E");
  ok("points tsumo split matches han/fu total", d.S === scoredKo.total);
  assertZeroSum(d);
  const scoredOya = scoreFromHanFu({
    han: 2,
    fu: 30,
    winType: "tsumo",
    winner: "E",
    winnerIsDealer: true,
    dealerSeat: "E",
  });
  ok(`dealer 2/30 tsumo collects ${scoredOya.total}`, scoredOya.total > 0);
}

// Honba on tsumo
{
  const scoredKo = scoreFromHanFu({
    han: 2,
    fu: 30,
    winType: "tsumo",
    winner: "S",
    winnerIsDealer: false,
    dealerSeat: "E",
  });
  let d = buildTsumoDeltasFromWinnerTotal("S", scoredKo.total, false, "E");
  d = applyHonbaToDeltas(d, 2, 300, "tsumo");
  ok("honba 2 tsumo adds 1800 to winner", d.S === scoredKo.total + 1800);
  assertZeroSum(d);
}

// Riichi through draw
{
  const events: SessionEvent[] = [
    { type: "riichi", createdAt: "1", seat: "E", value: 1000 },
    { type: "draw", createdAt: "2", dealerTenpai: false, drawKind: "standard" },
    { type: "riichi", createdAt: "3", seat: "E", value: 1000 },
  ];
  ok("riichi pool carries through draw", pendingRiichiPool(events) === 2000);
  ok("riichi declare resets after draw", riichiDeclaredThisHand(events).E === true);
  ok("new hand starts after draw", handEventsStartIndex(events) === 2);
}

console.log("\nAll scenario checks passed.");
