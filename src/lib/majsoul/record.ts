import type { MajsoulRecordGame } from "@/lib/majsoul/proto";

export const DEFAULT_STARTING_POINTS = 25000;

export type MajsoulSeat = {
  /** 0=East, 1=South, 2=West, 3=North. */
  seat: number;
  accountId: number;
  nickname: string;
  finalScore: number;
  isAi: boolean;
};

export type MajsoulGameSummary = {
  recordUuid: string;
  playedAt: Date;
  startingPoints: number;
  seats: MajsoulSeat[];
};

export class MajsoulRecordShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MajsoulRecordShapeError";
  }
}

/**
 * Reduce a Mahjong Soul `RecordGame` head to the fields the importer stores.
 *
 * Seats come from `result.players` (every seat, finished game only). Human
 * identities come from `accounts`, which omits AI seats entirely — so a seat
 * missing from that map is a bot. `part_point_1` is the final table score;
 * `total_point` is the ranked-points delta and is not what we want.
 */
export function summarizeMajsoulRecord(record: MajsoulRecordGame): MajsoulGameSummary {
  const players = record.result?.players ?? [];
  if (players.length === 0) {
    throw new MajsoulRecordShapeError(
      "That game has no final scores yet — it may still be in progress or was terminated early."
    );
  }
  if (players.length !== 4) {
    throw new MajsoulRecordShapeError(
      `Only 4-player games can be imported (that game has ${players.length} seats).`
    );
  }

  const humansBySeat = new Map(
    (record.accounts ?? []).map((account) => [account.seat, account])
  );

  const seats: MajsoulSeat[] = players
    .map((player) => {
      const human = humansBySeat.get(player.seat);
      return {
        seat: player.seat,
        accountId: human?.account_id ?? 0,
        nickname: human?.nickname?.trim() || "",
        finalScore: player.part_point_1,
        isAi: !human,
      };
    })
    .sort((a, b) => a.seat - b.seat);

  if (seats.some((seat) => !seat.isAi && !seat.nickname)) {
    throw new MajsoulRecordShapeError("A human seat in that game has no nickname.");
  }

  const endTime = record.end_time || record.start_time;
  if (!endTime) {
    throw new MajsoulRecordShapeError("That game record has no end time.");
  }

  const initPoint = record.config?.mode?.detail_rule?.init_point;

  return {
    recordUuid: record.uuid,
    playedAt: new Date(endTime * 1000),
    startingPoints: initPoint && initPoint > 0 ? initPoint : DEFAULT_STARTING_POINTS,
    seats,
  };
}
