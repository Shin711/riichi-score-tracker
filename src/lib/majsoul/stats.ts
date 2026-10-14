import { liqiType } from "@/lib/majsoul/proto";

export type MajsoulSeatStats = {
  /** 0=East, 1=South, 2=West, 3=North. */
  seat: number;
  wins: number;
  /** How many of `wins` were self-draws. */
  tsumo: number;
  dealIns: number;
  /** Riichi declarations (double riichi included). */
  riichi: number;
  /** Chi, pon and open kan. */
  calls: number;
};

export type MajsoulWinningHand = {
  seat: number;
  /** Hand value before honba and riichi sticks. */
  points: number;
  /** Han, or yakuman multiples when `yakuman` is set. */
  han: number;
  fu: number;
  yakuman: boolean;
  tsumo: boolean;
  /** Who dealt in, or null for a tsumo. */
  dealInSeat: number | null;
};

export type MajsoulGameStats = {
  hands: number;
  /** Hands that ended without a win (exhaustive or abortive). */
  draws: number;
  seats: MajsoulSeatStats[];
  biggestHand: MajsoulWinningHand | null;
};

type Wrapped = { name: string; data: Uint8Array };

type DetailRecords = {
  records?: Uint8Array[];
  actions?: Array<{ result?: Uint8Array }>;
};

type Hule = {
  seat: number;
  zimo: boolean;
  qinjia: boolean;
  yiman: boolean;
  count: number;
  fu: number;
  point_rong: number;
  point_zimo_qin: number;
  point_zimo_xian: number;
  dadian: number;
};

const SEAT_COUNT = 4;

function unwrap(bytes: Uint8Array): Wrapped {
  return liqiType("Wrapper").decode(bytes) as unknown as Wrapped;
}

function decodeRecord<T>(wrapped: Wrapped): T {
  return liqiType(wrapped.name.replace(/^\.lq\./, "")).decode(wrapped.data) as unknown as T;
}

function handPoints(hule: Hule): number {
  if (hule.dadian > 0) return hule.dadian;
  if (!hule.zimo) return hule.point_rong;
  return hule.qinjia
    ? hule.point_zimo_xian * (SEAT_COUNT - 1)
    : hule.point_zimo_qin + hule.point_zimo_xian * (SEAT_COUNT - 2);
}

/**
 * Per-seat stats from a Mahjong Soul replay (`ResGameRecord.data`).
 *
 * Returns null when the payload is not a 4-player replay we can read — stats
 * are a nicety, so callers just leave them out.
 */
export function computeMajsoulGameStats(detail: Uint8Array): MajsoulGameStats | null {
  let events: Wrapped[];
  try {
    const outer = unwrap(detail);
    if (outer.name !== ".lq.GameDetailRecords") return null;
    const records = liqiType("GameDetailRecords").decode(outer.data) as unknown as DetailRecords;
    const encoded = records.actions?.length
      ? records.actions.flatMap((action) => (action.result?.length ? [action.result] : []))
      : (records.records ?? []);
    events = encoded.map(unwrap);
  } catch {
    return null;
  }

  const seats: MajsoulSeatStats[] = Array.from({ length: SEAT_COUNT }, (_, seat) => ({
    seat,
    wins: 0,
    tsumo: 0,
    dealIns: 0,
    riichi: 0,
    calls: 0,
  }));
  let hands = 0;
  let draws = 0;
  let biggestHand: MajsoulWinningHand | null = null;
  // Whoever last put a tile on the table — a discard, or a kan that can be robbed.
  let lastTileSeat: number | null = null;

  try {
    for (const event of events) {
      switch (event.name) {
        case ".lq.RecordNewRound":
          hands += 1;
          lastTileSeat = null;
          break;
        case ".lq.RecordDiscardTile": {
          const discard = decodeRecord<{ seat: number; is_liqi: boolean; is_wliqi: boolean }>(event);
          lastTileSeat = discard.seat;
          if (discard.is_liqi || discard.is_wliqi) seats[discard.seat].riichi += 1;
          break;
        }
        case ".lq.RecordChiPengGang":
          seats[decodeRecord<{ seat: number }>(event).seat].calls += 1;
          break;
        case ".lq.RecordAnGangAddGang":
          lastTileSeat = decodeRecord<{ seat: number }>(event).seat;
          break;
        case ".lq.RecordHule":
          for (const hule of decodeRecord<{ hules?: Hule[] }>(event).hules ?? []) {
            const dealInSeat = hule.zimo ? null : lastTileSeat;
            seats[hule.seat].wins += 1;
            if (hule.zimo) seats[hule.seat].tsumo += 1;
            // One deal-in per winner: a double ron counts twice against the discarder.
            if (dealInSeat !== null) seats[dealInSeat].dealIns += 1;

            const points = handPoints(hule);
            if (!biggestHand || points > biggestHand.points) {
              biggestHand = {
                seat: hule.seat,
                points,
                han: hule.count,
                fu: hule.fu,
                yakuman: hule.yiman,
                tsumo: hule.zimo,
                dealInSeat,
              };
            }
          }
          break;
        case ".lq.RecordNoTile":
        case ".lq.RecordLiuJu":
          draws += 1;
          break;
      }
    }
  } catch {
    // A seat outside 0–3 (3-player or event modes) or a malformed record.
    return null;
  }

  if (hands === 0) return null;
  return { hands, draws, seats, biggestHand };
}

/**
 * Re-keys stats from Mahjong Soul seats onto another seat order (e.g. a game
 * typed in by hand with its log link attached), matching seats by final score.
 * Returns null when the scores do not pair up one-to-one.
 */
export function alignMajsoulStatsToScores(
  stats: MajsoulGameStats,
  scoresByMajsoulSeat: number[],
  targetScores: number[]
): MajsoulGameStats | null {
  if (scoresByMajsoulSeat.length !== targetScores.length) return null;

  const targetOf = new Map<number, number>();
  const taken = new Set<number>();
  scoresByMajsoulSeat.forEach((score, seat) => {
    // Prefer the same position so tied scores stay put when the order already matches.
    const candidates = [seat, ...targetScores.keys()];
    const target = candidates.find((index) => targetScores[index] === score && !taken.has(index));
    if (target === undefined) return;
    taken.add(target);
    targetOf.set(seat, target);
  });
  if (targetOf.size !== targetScores.length) return null;

  const remap = (seat: number) => targetOf.get(seat) ?? seat;
  return {
    ...stats,
    seats: stats.seats.map((seat) => ({ ...seat, seat: remap(seat.seat) })),
    biggestHand: stats.biggestHand && {
      ...stats.biggestHand,
      seat: remap(stats.biggestHand.seat),
      dealInSeat:
        stats.biggestHand.dealInSeat === null ? null : remap(stats.biggestHand.dealInSeat),
    },
  };
}
