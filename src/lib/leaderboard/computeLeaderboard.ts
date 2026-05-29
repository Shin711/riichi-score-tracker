import type { EventRow } from "@/lib/db/types";
import { mapEventRow } from "@/lib/scoring/events";
import {
  computeTotals,
  defaultRules,
  type Rules,
  type Seat,
} from "@/lib/scoring/ledger";

import { gameScoreDelta, LEADERBOARD_POINTS_DIVISOR } from "@/lib/leaderboard/points";

const seats: Seat[] = ["E", "S", "W", "N"];

export type LeaderboardEntry = {
  playerId: string;
  displayName: string;
  gamesPlayed: number;
  /** Sum of (ending score − starting stack) across finished games. */
  totalDelta: number;
  /** totalDelta ÷ 1,000 — same units as Riichi Leaderboard.xlsx. */
  points: number;
};

export type SessionSnapshot = {
  sessionId: string;
  rules: Rules;
  events: Pick<EventRow, "type" | "payload_json" | "created_at">[];
  assignments: Array<{ seat: Seat; playerId: string; displayName: string }>;
};

function asSeat(value: unknown): Seat | null {
  if (value === "E" || value === "S" || value === "W" || value === "N") return value;
  return null;
}

export function parseRules(rulesJson: unknown): Rules {
  if (!rulesJson || typeof rulesJson !== "object") return defaultRules();
  const r = rulesJson as Partial<Rules>;
  const defaults = defaultRules();
  return {
    startingPoints:
      typeof r.startingPoints === "number" ? r.startingPoints : defaults.startingPoints,
    returnPoints: typeof r.returnPoints === "number" ? r.returnPoints : defaults.returnPoints,
    riichiStickValue:
      typeof r.riichiStickValue === "number" ? r.riichiStickValue : defaults.riichiStickValue,
    honbaValue: typeof r.honbaValue === "number" ? r.honbaValue : defaults.honbaValue,
    gameLength:
      r.gameLength === "east" || r.gameLength === "hanchan" ? r.gameLength : defaults.gameLength,
    roundWind:
      r.roundWind === "east" || r.roundWind === "south" ? r.roundWind : defaults.roundWind,
    dealerSeat:
      r.dealerSeat === "E" || r.dealerSeat === "S" || r.dealerSeat === "W" || r.dealerSeat === "N"
        ? r.dealerSeat
        : defaults.dealerSeat,
  };
}

export function computeLeaderboard(
  sessionSnapshots: SessionSnapshot[],
  allPlayers: Array<{ id: string; display_name: string }> = []
): LeaderboardEntry[] {
  const byPlayer = new Map<
    string,
    { playerId: string; displayName: string; gamesPlayed: number; totalDelta: number }
  >();

  for (const { id, display_name } of allPlayers) {
    byPlayer.set(id, {
      playerId: id,
      displayName: display_name,
      gamesPlayed: 0,
      totalDelta: 0,
    });
  }

  for (const session of sessionSnapshots) {
    if (session.assignments.length === 0) continue;

    const mappedEvents = session.events.map((row) =>
      mapEventRow({
        id: "",
        session_id: session.sessionId,
        type: row.type,
        payload_json: row.payload_json,
        created_at: row.created_at,
      })
    );
    const totals = computeTotals(seats, session.rules, mappedEvents);

    for (const { seat, playerId, displayName } of session.assignments) {
      const delta = gameScoreDelta(totals[seat], session.rules.startingPoints);
      let entry = byPlayer.get(playerId);
      if (!entry) {
        entry = {
          playerId,
          displayName,
          gamesPlayed: 0,
          totalDelta: 0,
        };
        byPlayer.set(playerId, entry);
      }
      entry.displayName = displayName;
      entry.gamesPlayed += 1;
      entry.totalDelta += delta;
    }
  }

  return Array.from(byPlayer.values())
    .map((entry) => ({
      ...entry,
      points: entry.totalDelta / LEADERBOARD_POINTS_DIVISOR,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.gamesPlayed - a.gamesPlayed ||
        a.displayName.localeCompare(b.displayName)
    );
}

export function groupSessionSnapshots(input: {
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
}): SessionSnapshot[] {
  const eventsBySession = new Map<string, SessionSnapshot["events"]>();
  for (const ev of input.events) {
    const list = eventsBySession.get(ev.session_id) ?? [];
    list.push({
      type: ev.type,
      payload_json: ev.payload_json,
      created_at: ev.created_at,
    });
    eventsBySession.set(ev.session_id, list);
  }

  const assignmentsBySession = new Map<string, SessionSnapshot["assignments"]>();
  for (const row of input.sessionPlayers) {
    const seat = asSeat(row.seat);
    if (!seat) continue;
    const players = row.players;
    const displayName = Array.isArray(players)
      ? players[0]?.display_name
      : players?.display_name;
    if (!displayName) continue;

    const list = assignmentsBySession.get(row.session_id) ?? [];
    list.push({ seat, playerId: row.player_id, displayName });
    assignmentsBySession.set(row.session_id, list);
  }

  return input.sessions.map((session) => ({
    sessionId: session.id,
    rules: parseRules(session.rules_json),
    events: eventsBySession.get(session.id) ?? [],
    assignments: assignmentsBySession.get(session.id) ?? [],
  }));
}
