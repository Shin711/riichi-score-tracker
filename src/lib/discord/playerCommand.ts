import type { SupabaseClient } from "@supabase/supabase-js";

import {
  autocompleteReply,
  commandOptionValue,
  ephemeralReply,
  type Interaction,
} from "@/lib/discord/interactions";
import { buildPlayerStatsResponse } from "@/lib/discord/playerStatsMessage";
import type { ImportedGameEntry } from "@/lib/imports/types";
import { computeLeaderboard, groupSessionSnapshots } from "@/lib/leaderboard/computeLeaderboard";
import { mergeImportedGamesIntoLeaderboard } from "@/lib/leaderboard/mergeImports";
import { leaderboardRating } from "@/lib/leaderboard/points";
import {
  gamesUntilLeaderboardRank,
  getLeaderboardScoringOptions,
  splitLeaderboardEntries,
} from "@/lib/leaderboard/qualification";
import {
  aggregatePlayerRivalry,
  rivalryGamesFromRows,
  type PlayerLeaderboardStanding,
  type PlayerRivalry,
} from "@/lib/leaderboard/rivalries";
import {
  formatMonthLabel,
  getMonthPartsInTimezone,
  getMonthPeriodBounds,
} from "@/lib/leaderboard/timezone";
import { findPlayerByDisplayName, playerNameKey } from "@/lib/players/names";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const IN_CHUNK = 100;
const AUTOCOMPLETE_LIMIT = 25;
const SUGGESTION_LIMIT = 5;

type PlayerName = { id: string; display_name: string };

type ImportRow = {
  played_at: string;
  starting_points: number;
  entries_json: ImportedGameEntry[] | null;
};

type SessionRow = { id: string; rules_json: unknown };

type SessionPlayerRow = {
  session_id: string;
  seat: string;
  player_id: string;
  players: { display_name: string } | { display_name: string }[] | null;
};

type EventQueryRow = {
  session_id: string;
  type: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
};

export type PlayerLookup =
  | { status: "not_found"; query: string; suggestions: string[] }
  | {
      status: "ok";
      rivalry: PlayerRivalry;
      standing: PlayerLeaderboardStanding | null;
      periodLabel: string;
    };

async function selectPages<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/** Case-insensitive prefix match, alphabetical. An empty query lists the first names. */
export function autocompletePlayerChoices(
  names: string[],
  query: string
): Array<{ name: string; value: string }> {
  const prefix = playerNameKey(query);
  const sorted = [...names].filter((name) => name.trim()).sort((a, b) => a.localeCompare(b, "en"));
  const matches = prefix ? sorted.filter((name) => playerNameKey(name).startsWith(prefix)) : sorted;
  return matches.slice(0, AUTOCOMPLETE_LIMIT).map((name) => {
    const choice = name.slice(0, 100);
    return { name: choice, value: choice };
  });
}

export function playerNotFoundMessage(name: string, suggestions: string[]): string {
  const lines = [`No player named **${name}**.`];
  if (suggestions.length > 0) {
    lines.push("", "Did you mean:", ...suggestions.map((suggestion) => `• ${suggestion}`));
  } else {
    lines.push("", "Use a name from the club roster. Matches show up as you type.");
  }
  return lines.join("\n");
}

function suggestionsFor(players: PlayerName[], query: string): string[] {
  const key = playerNameKey(query);
  if (!key) return [];
  return players
    .map((player) => player.display_name)
    .filter((name) => playerNameKey(name).includes(key))
    .sort((a, b) => a.localeCompare(b, "en"))
    .slice(0, SUGGESTION_LIMIT);
}

/** Same Eastern month window as the current leaderboard. */
function currentMonthBounds(now: Date) {
  const { year, month } = getMonthPartsInTimezone(now);
  return { year, month, ...getMonthPeriodBounds(year, month), label: formatMonthLabel(year, month) };
}

export async function lookupPlayerStats(
  supabase: SupabaseClient,
  name: string,
  now = new Date()
): Promise<PlayerLookup> {
  const players = await selectPages<PlayerName>((from, to) =>
    supabase
      .from("players")
      .select("id, display_name")
      .order("display_name", { ascending: true })
      .range(from, to)
  );
  const player = findPlayerByDisplayName(players, name);
  if (!player) {
    return { status: "not_found", query: name, suggestions: suggestionsFor(players, name) };
  }

  const bounds = currentMonthBounds(now);
  const imports = await selectPages<ImportRow>((from, to) =>
    supabase
      .from("imported_games")
      .select("played_at, starting_points, entries_json")
      .gte("played_at", bounds.startIso)
      .lt("played_at", bounds.endIso)
      .order("played_at", { ascending: true })
      .range(from, to)
  );

  const sessions = await selectPages<SessionRow>((from, to) =>
    supabase
      .from("sessions")
      .select("id, rules_json")
      .not("ended_at", "is", null)
      .gte("ended_at", bounds.startIso)
      .lt("ended_at", bounds.endIso)
      .order("ended_at", { ascending: true })
      .range(from, to)
  );

  const sessionIds = sessions.map((session) => session.id);
  const sessionPlayers: SessionPlayerRow[] = [];
  const events: EventQueryRow[] = [];
  for (const ids of chunks(sessionIds, IN_CHUNK)) {
    sessionPlayers.push(
      ...(await selectPages<SessionPlayerRow>((from, to) =>
        supabase
          .from("session_players")
          .select("session_id, seat, player_id, players(display_name)")
          .in("session_id", ids)
          .range(from, to)
      ))
    );
    events.push(
      ...(await selectPages<EventQueryRow>((from, to) =>
        supabase
          .from("events")
          .select("session_id, type, payload_json, created_at")
          .in("session_id", ids)
          .order("created_at", { ascending: true })
          .range(from, to)
      ))
    );
  }

  const period = { year: bounds.year, month: bounds.month };
  const scoring = getLeaderboardScoringOptions(period);
  const normalizedEvents = events.map((event) => ({
    ...event,
    payload_json: event.payload_json ?? {},
  }));

  const snapshots = groupSessionSnapshots({
    sessions,
    sessionPlayers,
    events: normalizedEvents,
  });
  const leaderboard = mergeImportedGamesIntoLeaderboard(
    computeLeaderboard(snapshots, players, scoring),
    imports.map((row) => ({
      starting_points: row.starting_points,
      entries_json: row.entries_json ?? [],
    })),
    scoring
  );
  const { ranked } = splitLeaderboardEntries(leaderboard, period);
  const entry = leaderboard.find((row) => row.playerId === player.id);
  const rankIndex = ranked.findIndex((row) => row.playerId === player.id);

  const standing: PlayerLeaderboardStanding | null = entry
    ? {
        rank: rankIndex >= 0 ? rankIndex + 1 : null,
        rankedCount: ranked.length,
        gamesToRank: gamesUntilLeaderboardRank(entry.gamesPlayed, scoring.minGamesForRank),
        rating: scoring.useRating
          ? leaderboardRating(entry.points, entry.gamesPlayed, scoring.confidenceWeighted)
          : entry.points,
      }
    : null;

  const names = new Map(players.map((row) => [row.id, row.display_name]));
  const rivalry = aggregatePlayerRivalry(
    player.id,
    player.display_name,
    rivalryGamesFromRows({
      imports,
      sessions,
      sessionPlayers,
      events: normalizedEvents,
      usePlacementBonus: scoring.usePlacementBonus,
    }),
    names
  );

  return {
    status: "ok",
    rivalry,
    standing,
    periodLabel: bounds.label,
  };
}

export async function handlePlayerCommand(interaction: Interaction, now = new Date()) {
  if (interaction.data?.name !== "player") {
    return ephemeralReply("That command is not available.");
  }

  const name = commandOptionValue(interaction, "name").trim();
  if (!name) return ephemeralReply("Name a player, for example `/player name:Alice`.");

  const supabase = getSupabaseAdmin();
  if (!supabase) return ephemeralReply("The database is not configured.");

  try {
    const result = await lookupPlayerStats(supabase, name, now);
    if (result.status === "not_found") {
      return ephemeralReply(playerNotFoundMessage(result.query, result.suggestions));
    }
    return buildPlayerStatsResponse(result.rivalry, result.periodLabel, now, result.standing);
  } catch (error) {
    console.error("[discord] player command failed", error);
    return ephemeralReply("Could not load that player's stats.");
  }
}

export async function handlePlayerAutocomplete(interaction: Interaction) {
  if (interaction.data?.name !== "player") return autocompleteReply([]);

  const focused = interaction.data?.options?.find((option) => option.focused);
  if (focused?.name && focused.name !== "name") return autocompleteReply([]);

  const supabase = getSupabaseAdmin();
  if (!supabase) return autocompleteReply([]);

  const query = commandOptionValue(interaction, "name");
  try {
    const players = await selectPages<PlayerName>((from, to) =>
      supabase
        .from("players")
        .select("id, display_name")
        .order("display_name", { ascending: true })
        .range(from, to)
    );
    return autocompleteReply(
      autocompletePlayerChoices(
        players.map((player) => player.display_name),
        query
      )
    );
  } catch (error) {
    console.error("[discord] player autocomplete failed", error);
    return autocompleteReply([]);
  }
}
