import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { liqiType } from "@/lib/majsoul/proto";
import { alignMajsoulStatsToScores, computeMajsoulGameStats } from "@/lib/majsoul/stats";

function encode(typeName: string, payload: Record<string, unknown>): Uint8Array {
  const type = liqiType(typeName);
  return type.encode(type.create(payload)).finish();
}

function wrap(typeName: string, payload: Record<string, unknown>): Uint8Array {
  return encode("Wrapper", { name: `.lq.${typeName}`, data: encode(typeName, payload) });
}

function replay(events: Uint8Array[], legacy = false): Uint8Array {
  return wrap(
    "GameDetailRecords",
    legacy
      ? { records: events }
      : // Real logs interleave non-record actions (user input) that carry no result.
        { version: 210715, actions: [{ type: 2 }, ...events.map((result) => ({ type: 1, result }))] }
  );
}

const ron = (seat: number, extra: Record<string, unknown> = {}) => ({
  seat,
  zimo: false,
  count: 3,
  fu: 40,
  point_rong: 5200,
  dadian: 5200,
  ...extra,
});

/** Three hands: seat 1 rons seat 0 after a riichi, seat 2 tsumos a haneman, then a draw. */
const EVENTS = [
  wrap("RecordNewRound", { chang: 0, ju: 0 }),
  wrap("RecordDiscardTile", { seat: 1, tile: "1m", is_liqi: true }),
  wrap("RecordChiPengGang", { seat: 3, type: 1 }),
  wrap("RecordDiscardTile", { seat: 3, tile: "9p" }),
  wrap("RecordDiscardTile", { seat: 0, tile: "5s" }),
  wrap("RecordHule", { hules: [ron(1)] }),
  wrap("RecordNewRound", { chang: 0, ju: 1 }),
  wrap("RecordDiscardTile", { seat: 0, tile: "2z" }),
  wrap("RecordHule", {
    hules: [{ seat: 2, zimo: true, count: 6, fu: 30, point_zimo_qin: 6000, point_zimo_xian: 3000 }],
  }),
  wrap("RecordNewRound", { chang: 0, ju: 2 }),
  wrap("RecordNoTile", {}),
];

describe("computeMajsoulGameStats", () => {
  it("counts wins, deal-ins, riichi and calls per seat", () => {
    const stats = computeMajsoulGameStats(replay(EVENTS));
    assert.ok(stats);
    assert.equal(stats.hands, 3);
    assert.equal(stats.draws, 1);
    assert.deepEqual(stats.seats, [
      { seat: 0, wins: 0, tsumo: 0, dealIns: 1, riichi: 0, calls: 0 },
      { seat: 1, wins: 1, tsumo: 0, dealIns: 0, riichi: 1, calls: 0 },
      { seat: 2, wins: 1, tsumo: 1, dealIns: 0, riichi: 0, calls: 0 },
      { seat: 3, wins: 0, tsumo: 0, dealIns: 0, riichi: 0, calls: 1 },
    ]);
  });

  it("picks the biggest hand, totalling a tsumo when dadian is missing", () => {
    const stats = computeMajsoulGameStats(replay(EVENTS));
    assert.deepEqual(stats?.biggestHand, {
      seat: 2,
      points: 12000,
      han: 6,
      fu: 30,
      yakuman: false,
      tsumo: true,
      dealInSeat: null,
    });
  });

  it("charges a double ron to the discarder twice, and a robbed kan to the caller", () => {
    const stats = computeMajsoulGameStats(
      replay([
        wrap("RecordNewRound", {}),
        wrap("RecordDiscardTile", { seat: 2, tile: "1m" }),
        wrap("RecordHule", { hules: [ron(0), ron(3)] }),
        wrap("RecordNewRound", {}),
        wrap("RecordDiscardTile", { seat: 0, tile: "1m" }),
        wrap("RecordAnGangAddGang", { seat: 1, type: 2 }),
        wrap("RecordHule", { hules: [ron(3)] }),
      ])
    );
    assert.deepEqual(
      stats?.seats.map((seat) => seat.dealIns),
      [0, 1, 2, 0]
    );
  });

  it("reads pre-2021 logs that store records directly", () => {
    assert.equal(computeMajsoulGameStats(replay(EVENTS, true))?.hands, 3);
  });

  it("returns null for anything that is not a 4-player replay", () => {
    assert.equal(computeMajsoulGameStats(new Uint8Array([1, 2, 3])), null);
    assert.equal(computeMajsoulGameStats(wrap("RecordNoTile", {})), null);
    assert.equal(computeMajsoulGameStats(replay([])), null);
  });
});

describe("alignMajsoulStatsToScores", () => {
  const stats = computeMajsoulGameStats(replay(EVENTS))!;

  it("leaves stats alone when the seat order already matches, ties included", () => {
    const scores = [25000, 25000, 30000, 20000];
    assert.deepEqual(alignMajsoulStatsToScores(stats, scores, scores), stats);
  });

  it("follows a game that was typed in under a different seat order", () => {
    const aligned = alignMajsoulStatsToScores(
      stats,
      [18000, 30200, 37000, 14800],
      [37000, 14800, 18000, 30200]
    );
    assert.deepEqual(
      aligned?.seats.map((seat) => seat.seat),
      [2, 3, 0, 1]
    );
    assert.equal(aligned?.biggestHand?.seat, 0);
  });

  it("gives up when the scores do not pair up", () => {
    assert.equal(
      alignMajsoulStatsToScores(stats, [18000, 30200, 37000, 14800], [18000, 30200, 37000, 14900]),
      null
    );
  });
});
