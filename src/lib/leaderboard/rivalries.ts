import type { ImportedGameEntry } from "@/lib/imports/types";
import { isHumanImportEntry } from "@/lib/imports/types";
import { groupSessionSnapshots, type SessionSnapshot } from "@/lib/leaderboard/computeLeaderboard";
import { importedGameResults } from "@/lib/leaderboard/gameResults";
import { umaAdjustments } from "@/lib/leaderboard/placement";
import { gameScoreDelta, leaderboardPoints } from "@/lib/leaderboard/points";
import { mapEventRow } from "@/lib/scoring/events";
import { computeTotals, type Seat } from "@/lib/scoring/ledger";

const SEATS: Seat[] = ["E", "S", "W", "N"];

export type RivalryStanding = {
  playerId: string;
  displayName: string;
  /** 1 is first. Unique within a game, AI seats included in the numbering. */
  placement: number;
  finalScore: number;
  /** Leaderboard points for this game (score delta ÷ 1,000 + uma + chombo). */
  net: number;
};

export type RivalryGameInput = {
  standings: RivalryStanding[];
};

export type RivalMatchup = {
  playerId: string;
  displayName: string;
  games: number;
  wins: number;
  losses: number;
};

export type PlayerLeaderboardStanding = {
  /** 1-based rank among qualified players, or null when not ranked yet. */
  rank: number | null;
  rankedCount: number;
  gamesToRank: number;
  /** Matches the rating shown on the monthly leaderboard. */
  rating: number;
};

export type PlayerRivalry = {
  playerId: string;
  displayName: string;
  games: number;
  /** Counts for [1st, 2nd, 3rd, 4th]. */
  placements: [number, number, number, number];
  avgPlacement: number;
  highScore: number | null;
  lowScore: number | null;
  netPoints: number;
  /** Opponents this player placed above more often than below. */
  bestMatchups: RivalMatchup[];
  /** Opponents this player placed below more often than above. */
  toughestMatchups: RivalMatchup[];
};

function seatIndex(seat: Seat): number {
  return SEATS.indexOf(seat);
}

export function rivalryGameFromImport(row: {
  entries_json: ImportedGameEntry[] | null;
  starting_points: number;
  played_at: string;
}): RivalryGameInput {
  const entries = Array.isArray(row.entries_json) ? row.entries_json : [];
  const standings = importedGameResults({ ...row, entries_json: entries }).seats.flatMap((seat) =>
    isHumanImportEntry(seat)
      ? [
          {
            playerId: seat.player_id,
            displayName: seat.display_name,
            placement: seat.placement,
            finalScore: seat.final_score,
            net: seat.net,
          },
        ]
      : []
  );

  return { standings };
}

/** Table standings for a finished session. Null when no players were seated. */
export function rivalryGameFromSession(
  snapshot: SessionSnapshot,
  usePlacementBonus = true
): RivalryGameInput | null {
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
  const bonuses = usePlacementBonus ? umaAdjustments(SEATS.map((seat) => totals[seat])) : null;
  const seatOrder = [...SEATS].sort(
    (a, b) => totals[b] - totals[a] || seatIndex(a) - seatIndex(b)
  );
  const placementOf = new Map(seatOrder.map((seat, index) => [seat, index + 1]));

  const ranked = [...snapshot.assignments].sort(
    (a, b) => (placementOf.get(a.seat) ?? 4) - (placementOf.get(b.seat) ?? 4)
  );

  return {
    standings: ranked.map((seat) => {
      const idx = seatIndex(seat.seat);
      const score = leaderboardPoints(
        gameScoreDelta(totals[seat.seat], snapshot.rules.startingPoints)
      );
      return {
        playerId: seat.playerId,
        displayName: seat.displayName,
        placement: placementOf.get(seat.seat) ?? idx + 1,
        finalScore: totals[seat.seat],
        net: score + (bonuses ? bonuses[idx] : 0),
      };
    }),
  };
}

type MatchupBucket = { games: number; wins: number; losses: number; displayName: string };

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
 * Placement, score, and head-to-head matchup totals for one player.
 * Uses only final table results so IRL manual entries and online games count equally.
 */
export function aggregatePlayerRivalry(
  playerId: string,
  displayName: string,
  games: RivalryGameInput[],
  names: ReadonlyMap<string, string> = new Map()
): PlayerRivalry {
  let gameCount = 0;
  let placementSum = 0;
  let netPoints = 0;
  let highScore: number | null = null;
  let lowScore: number | null = null;
  const placements: [number, number, number, number] = [0, 0, 0, 0];
  const matchups = new Map<string, MatchupBucket>();

  for (const game of games) {
    const seen = new Map<string, RivalryStanding>();
    for (const seat of game.standings) {
      const existing = seen.get(seat.playerId);
      if (!existing || seat.placement < existing.placement) seen.set(seat.playerId, seat);
    }
    const me = seen.get(playerId);
    if (!me) continue;

    gameCount += 1;
    placementSum += me.placement;
    netPoints += me.net;
    if (me.placement >= 1 && me.placement <= 4) placements[me.placement - 1] += 1;
    if (highScore === null || me.finalScore > highScore) highScore = me.finalScore;
    if (lowScore === null || me.finalScore < lowScore) lowScore = me.finalScore;

    for (const other of seen.values()) {
      if (other.playerId === playerId) continue;
      const bucket = matchups.get(other.playerId) ?? {
        games: 0,
        wins: 0,
        losses: 0,
        displayName: nameOf(other.playerId, other.displayName, names),
      };
      bucket.games += 1;
      if (me.placement < other.placement) bucket.wins += 1;
      else if (me.placement > other.placement) bucket.losses += 1;
      bucket.displayName = nameOf(other.playerId, bucket.displayName, names);
      matchups.set(other.playerId, bucket);
    }
  }

  const allMatchups: RivalMatchup[] = [...matchups.entries()].map(([id, bucket]) => ({
    playerId: id,
    displayName: bucket.displayName,
    games: bucket.games,
    wins: bucket.wins,
    losses: bucket.losses,
  }));

  const bestMatchups = allMatchups
    .filter((m) => m.wins > m.losses)
    .sort(
      (a, b) =>
        b.wins - b.losses - (a.wins - a.losses) ||
        b.wins - a.wins ||
        b.games - a.games ||
        compareNames(a.displayName, b.displayName)
    );

  const toughestMatchups = allMatchups
    .filter((m) => m.losses > m.wins)
    .sort(
      (a, b) =>
        b.losses - b.wins - (a.losses - a.wins) ||
        b.losses - a.losses ||
        b.games - a.games ||
        compareNames(a.displayName, b.displayName)
    );

  return {
    playerId,
    displayName: nameOf(playerId, displayName, names),
    games: gameCount,
    placements,
    avgPlacement: gameCount > 0 ? placementSum / gameCount : 0,
    highScore,
    lowScore,
    netPoints,
    bestMatchups,
    toughestMatchups,
  };
}

export function rivalryGamesFromRows(input: {
  imports: Array<{
    entries_json: ImportedGameEntry[] | null;
    starting_points: number;
    played_at: string;
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
  usePlacementBonus?: boolean;
}): RivalryGameInput[] {
  const games = input.imports.map((row) => rivalryGameFromImport(row));
  for (const snapshot of groupSessionSnapshots(input)) {
    const game = rivalryGameFromSession(snapshot, input.usePlacementBonus ?? true);
    if (game) games.push(game);
  }
  return games;
}
