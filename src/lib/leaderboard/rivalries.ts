import type { ImportedGameEntry } from "@/lib/imports/types";
import { isHumanImportEntry } from "@/lib/imports/types";
import { groupSessionSnapshots, type SessionSnapshot } from "@/lib/leaderboard/computeLeaderboard";
import { importedGameResults } from "@/lib/leaderboard/gameResults";
import { parseHandResults } from "@/lib/leaderboard/handResults";
import { mapEventRow } from "@/lib/scoring/events";
import {
  computeTotals,
  inferWinWinner,
  type Seat,
  type SessionEvent,
} from "@/lib/scoring/ledger";

const SEATS: Seat[] = ["E", "S", "W", "N"];

export type RivalryStanding = {
  playerId: string;
  displayName: string;
  /** 1 is first. Unique within a game, AI seats included in the numbering. */
  placement: number;
};

export type RivalryHand = {
  /** Null when the winner is not a club player (an AI seat). */
  winnerId: string | null;
  /** Null for a tsumo, or when the discarder is not a club player. */
  dealInId: string | null;
  tsumo: boolean;
  points: number;
};

export type RivalryGameInput = {
  standings: RivalryStanding[];
  /**
   * Present when this game has a hand log (Mahjong Soul results, or a scored
   * session). Absent for a score-only import. An empty list means nobody won.
   */
  hands?: RivalryHand[];
};

export type RivalPointsLine = {
  playerId: string;
  displayName: string;
  count: number;
  points: number;
};

export type RivalTableLine = {
  playerId: string;
  displayName: string;
  games: number;
  wins: number;
};

export type PlayerRivalry = {
  playerId: string;
  displayName: string;
  games: number;
  ron: number;
  tsumo: number;
  dealIns: number;
  /** Games whose hands we could read. The rest still count toward placement. */
  gamesWithHands: number;
  fed: RivalPointsLine[];
  wonOff: RivalPointsLine[];
  /** Times this player placed above the opponent. Opponents they never beat are omitted. */
  beat: RivalTableLine[];
};

function seatIndex(seat: Seat): number {
  return SEATS.indexOf(seat);
}

function playerIdAt(
  entries: ImportedGameEntry[],
  seat: number
): string | null {
  const entry = entries[seat];
  if (!entry || !isHumanImportEntry(entry)) return null;
  return entry.player_id;
}

export function rivalryGameFromImport(
  row: {
    entries_json: ImportedGameEntry[] | null;
    starting_points: number;
    played_at: string;
    hand_results_json?: unknown;
  }
): RivalryGameInput {
  const entries = Array.isArray(row.entries_json) ? row.entries_json : [];
  const standings = importedGameResults({ ...row, entries_json: entries }).seats.flatMap((seat) =>
    isHumanImportEntry(seat)
      ? [{ playerId: seat.player_id, displayName: seat.display_name, placement: seat.placement }]
      : []
  );

  const stored = parseHandResults(row.hand_results_json);
  if (!stored) return { standings };

  return {
    standings,
    hands: stored.map((hand) => ({
      winnerId: playerIdAt(entries, hand.winnerSeat),
      dealInId: hand.dealInSeat === null ? null : playerIdAt(entries, hand.dealInSeat),
      tsumo: hand.dealInSeat === null,
      points: hand.points,
    })),
  };
}

function ronPayment(
  ev: Extract<SessionEvent, { type: "win" }>,
  from: Seat,
  winner: Seat
): number {
  const paid = ev.deltas[from] ?? 0;
  if (paid < 0) return -paid;
  const gained = ev.deltas[winner] ?? 0;
  return gained > 0 ? gained : 0;
}

function sessionWinHand(
  ev: Extract<SessionEvent, { type: "win" }>,
  playerAt: Map<Seat, string>
): RivalryHand | null {
  const losers = SEATS.filter((seat) => (ev.deltas[seat] ?? 0) < 0);
  const winner = ev.winner ?? inferWinWinner(ev);
  if (!winner) return null;

  let winType = ev.winType;
  if (!winType) {
    if (losers.length === 1) winType = "ron";
    else if (losers.length === 3) winType = "tsumo";
  }

  if (winType === "tsumo") {
    const gained = ev.deltas[winner] ?? 0;
    return {
      winnerId: playerAt.get(winner) ?? null,
      dealInId: null,
      tsumo: true,
      points: gained > 0 ? gained : 0,
    };
  }
  if (winType !== "ron") return null;

  const from = ev.fromSeat ?? (losers.length === 1 ? losers[0] : null);
  if (!from || from === winner) return null;
  return {
    winnerId: playerAt.get(winner) ?? null,
    dealInId: playerAt.get(from) ?? null,
    tsumo: false,
    points: ronPayment(ev, from, winner),
  };
}

/** Table order plus every scored win. Null when the session has no seated players. */
export function rivalryGameFromSession(snapshot: SessionSnapshot): RivalryGameInput | null {
  if (snapshot.assignments.length === 0) return null;

  const events = snapshot.events.map((row) =>
    mapEventRow({
      id: "",
      session_id: snapshot.sessionId,
      type: row.type,
      payload_json: row.payload_json,
      created_at: row.created_at,
    })
  );
  const totals = computeTotals(SEATS, snapshot.rules, events);
  const ranked = [...snapshot.assignments].sort(
    (a, b) => totals[b.seat] - totals[a.seat] || seatIndex(a.seat) - seatIndex(b.seat)
  );
  const playerAt = new Map(snapshot.assignments.map((seat) => [seat.seat, seat.playerId]));

  const hands: RivalryHand[] = [];
  for (const ev of events) {
    if (ev.type !== "win") continue;
    const hand = sessionWinHand(ev, playerAt);
    if (hand) hands.push(hand);
  }

  return {
    standings: ranked.map((seat, index) => ({
      playerId: seat.playerId,
      displayName: seat.displayName,
      placement: index + 1,
    })),
    hands,
  };
}

type PointsBucket = { count: number; points: number; displayName: string };
type TableBucket = { games: number; wins: number; displayName: string };

function nameOf(
  playerId: string,
  fallback: string,
  names: ReadonlyMap<string, string>
): string {
  return names.get(playerId) ?? fallback;
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

/**
 * Head-to-head totals for one player.
 *
 * Rons only: tsumo is counted on the player, not charged to an opponent.
 * Deal-ins into (and rons off) an AI seat count on the player's own line and
 * are left off the opponent lists.
 */
export function aggregatePlayerRivalry(
  playerId: string,
  displayName: string,
  games: RivalryGameInput[],
  names: ReadonlyMap<string, string> = new Map()
): PlayerRivalry {
  let gameCount = 0;
  let ron = 0;
  let tsumo = 0;
  let dealIns = 0;
  let gamesWithHands = 0;
  const fed = new Map<string, PointsBucket>();
  const wonOff = new Map<string, PointsBucket>();
  const beat = new Map<string, TableBucket>();

  const bump = (map: Map<string, PointsBucket>, opponentId: string, points: number, fallback: string) => {
    const bucket = map.get(opponentId) ?? {
      count: 0,
      points: 0,
      displayName: nameOf(opponentId, fallback, names),
    };
    bucket.count += 1;
    bucket.points += points;
    bucket.displayName = nameOf(opponentId, bucket.displayName, names);
    map.set(opponentId, bucket);
  };

  for (const game of games) {
    const seen = new Map<string, RivalryStanding>();
    for (const seat of game.standings) {
      const existing = seen.get(seat.playerId);
      if (!existing || seat.placement < existing.placement) seen.set(seat.playerId, seat);
    }
    const me = seen.get(playerId);
    if (!me) continue;

    gameCount += 1;
    if (game.hands) gamesWithHands += 1;

    for (const other of seen.values()) {
      if (other.playerId === playerId) continue;
      const bucket = beat.get(other.playerId) ?? {
        games: 0,
        wins: 0,
        displayName: nameOf(other.playerId, other.displayName, names),
      };
      bucket.games += 1;
      if (me.placement < other.placement) bucket.wins += 1;
      bucket.displayName = nameOf(other.playerId, other.displayName, names);
      beat.set(other.playerId, bucket);
    }

    for (const hand of game.hands ?? []) {
      if (hand.winnerId === playerId) {
        if (hand.tsumo) tsumo += 1;
        else ron += 1;
      }
      if (!hand.tsumo && hand.dealInId === playerId) dealIns += 1;

      if (hand.tsumo) continue;
      const standingName = (id: string) => seen.get(id)?.displayName ?? "";
      if (hand.dealInId === playerId && hand.winnerId && hand.winnerId !== playerId) {
        bump(fed, hand.winnerId, hand.points, standingName(hand.winnerId));
      }
      if (hand.winnerId === playerId && hand.dealInId && hand.dealInId !== playerId) {
        bump(wonOff, hand.dealInId, hand.points, standingName(hand.dealInId));
      }
    }
  }

  const pointsLines = (map: Map<string, PointsBucket>, byCountFirst: boolean): RivalPointsLine[] =>
    [...map.entries()]
      .map(([id, bucket]) => ({
        playerId: id,
        displayName: bucket.displayName || nameOf(id, "Player", names),
        count: bucket.count,
        points: bucket.points,
      }))
      .sort((a, b) =>
        byCountFirst
          ? b.count - a.count || b.points - a.points || compareNames(a.displayName, b.displayName)
          : b.points - a.points || b.count - a.count || compareNames(a.displayName, b.displayName)
      );

  return {
    playerId,
    displayName: nameOf(playerId, displayName, names),
    games: gameCount,
    ron,
    tsumo,
    dealIns,
    gamesWithHands,
    fed: pointsLines(fed, false),
    wonOff: pointsLines(wonOff, true),
    beat: [...beat.entries()]
      .map(([id, bucket]) => ({
        playerId: id,
        displayName: bucket.displayName,
        games: bucket.games,
        wins: bucket.wins,
      }))
      .filter((line) => line.wins > 0)
      .sort(
        (a, b) => b.wins - a.wins || b.games - a.games || compareNames(a.displayName, b.displayName)
      ),
  };
}

export function rivalryGamesFromRows(input: {
  imports: Array<{
    entries_json: ImportedGameEntry[] | null;
    starting_points: number;
    played_at: string;
    hand_results_json?: unknown;
  }>;
  sessions: Array<{ id: string; rules_json: unknown }>;
  sessionPlayers: Array<{
    session_id: string;
    seat: string;
    player_id: string;
    players: { display_name: string } | { display_name: string }[] | null;
  }>;
  events: Array<{
    session_id: string;
    type: string;
    payload_json: Record<string, unknown>;
    created_at: string;
  }>;
}): RivalryGameInput[] {
  const games = input.imports.map((row) => rivalryGameFromImport(row));
  for (const snapshot of groupSessionSnapshots(input)) {
    const game = rivalryGameFromSession(snapshot);
    if (game) games.push(game);
  }
  return games;
}
