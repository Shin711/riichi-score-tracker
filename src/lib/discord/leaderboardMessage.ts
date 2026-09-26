import type { DiscordWebhookPayload } from "@/lib/discord/webhook";
import type { LeaderboardEntry } from "@/lib/leaderboard/computeLeaderboard";
import {
  formatLeaderboardAverage,
  formatLeaderboardPoints,
  formatLeaderboardRating,
  formatPointsValue,
} from "@/lib/leaderboard/points";
import {
  gamesUntilLeaderboardRank,
  getLeaderboardScoringOptions,
  splitLeaderboardEntries,
  type LeaderboardScoringPeriod,
} from "@/lib/leaderboard/qualification";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** Club gold, matching the site header. */
const EMBED_COLOR = 0xd4a24c;

/** Discord hard limits we have to stay under. */
const MAX_DESCRIPTION = 4096;
const MAX_FIELD_VALUE = 1024;

/** Keeps the code block readable on phones rather than filling the channel. */
const MAX_RANKED_ROWS = 25;
const MAX_UNRANKED_ROWS = 12;
const MAX_NAME_WIDTH = 14;

export type LeaderboardMessageInput = {
  entries: LeaderboardEntry[];
  period: LeaderboardScoringPeriod & { label: string };
  minGamesForRank: number;
  useRating: boolean;
  gamesWithPlayers: number;
};

function truncateName(name: string): string {
  return name.length > MAX_NAME_WIDTH ? `${name.slice(0, MAX_NAME_WIDTH - 1)}…` : name;
}

function renderTable(
  headers: string[],
  rows: string[][],
  alignRight: boolean[]
): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length))
  );
  const renderRow = (cells: string[]) =>
    cells
      .map((cell, column) =>
        alignRight[column] ? cell.padStart(widths[column]) : cell.padEnd(widths[column])
      )
      .join("  ")
      .trimEnd();

  return [renderRow(headers), ...rows.map(renderRow)].join("\n");
}

function rankedTable(
  entries: LeaderboardEntry[],
  scoring: { useRating: boolean; confidenceWeighted: boolean; usePlacementBonus: boolean }
): string {
  const { useRating, confidenceWeighted, usePlacementBonus } = scoring;
  const shown = entries.slice(0, MAX_RANKED_ROWS);

  // From the October 2026 season, rating already is the net total, so the extra
  // column shows the score-only part (rating − score = uma).
  const headers = useRating
    ? ["#", "Player", "Rating", "Avg", usePlacementBonus ? "Score" : "Net", "G"]
    : ["#", "Player", "Points", "G"];
  const alignRight = useRating
    ? [true, false, true, true, true, true]
    : [true, false, true, true];

  const rows = shown.map((entry, index) => {
    const rank = String(index + 1);
    const name = truncateName(entry.displayName);
    return useRating
      ? [
          rank,
          name,
          formatLeaderboardRating(entry.points, entry.gamesPlayed, confidenceWeighted),
          formatLeaderboardAverage(entry.points, entry.gamesPlayed),
          formatLeaderboardPoints(entry.totalDelta),
          String(entry.gamesPlayed),
        ]
      : [rank, name, formatLeaderboardPoints(entry.totalDelta), String(entry.gamesPlayed)];
  });

  const table = renderTable(headers, rows, alignRight);
  const hidden = entries.length - shown.length;

  return hidden > 0 ? `${table}\n…and ${hidden} more` : table;
}

function unrankedValue(
  entries: LeaderboardEntry[],
  minGamesForRank: number
): string {
  const shown = entries.slice(0, MAX_UNRANKED_ROWS);
  const lines = shown.map((entry) => {
    const needed = gamesUntilLeaderboardRank(entry.gamesPlayed, minGamesForRank);
    const games = `${entry.gamesPlayed} game${entry.gamesPlayed === 1 ? "" : "s"}`;
    return `**${entry.displayName}** — net ${formatPointsValue(entry.points)} · ${games} · ${needed} to rank`;
  });

  const hidden = entries.length - shown.length;
  if (hidden > 0) lines.push(`…and ${hidden} more`);

  const value = lines.join("\n");
  return value.length > MAX_FIELD_VALUE ? `${value.slice(0, MAX_FIELD_VALUE - 1)}…` : value;
}

/** Human-readable body of the standings message (also handy for previews). */
export function buildLeaderboardEmbedDescription(input: LeaderboardMessageInput): string {
  const { ranked } = splitLeaderboardEntries(input.entries, input.period);

  if (ranked.length === 0) {
    return `No one has hit ${input.minGamesForRank} games yet this month.`;
  }

  const scoring = { ...getLeaderboardScoringOptions(input.period), useRating: input.useRating };
  const description = `\`\`\`\n${rankedTable(ranked, scoring)}\n\`\`\``;
  return description.length > MAX_DESCRIPTION
    ? `${description.slice(0, MAX_DESCRIPTION - 4)}\n\`\`\``
    : description;
}

export function buildLeaderboardWebhookPayload(
  input: LeaderboardMessageInput,
  now = new Date()
): DiscordWebhookPayload {
  const { ranked, unranked } = splitLeaderboardEntries(input.entries, input.period);
  const games = `${input.gamesWithPlayers} game${input.gamesWithPlayers === 1 ? "" : "s"}`;
  const { usePlacementBonus } = getLeaderboardScoringOptions(input.period);
  const scoring = usePlacementBonus
    ? "rating = net + uma (+15/+5/−5/−15)"
    : input.useRating
      ? "rating = confidence-weighted net"
      : "points = (ending − start) ÷ 1,000";

  const fields = [];
  if (unranked.length > 0) {
    fields.push({
      name: `Not ranked yet (under ${input.minGamesForRank} games)`,
      value: unrankedValue(unranked, input.minGamesForRank),
    });
  }

  return {
    embeds: [
      {
        title: `${input.period.label} Leaderboard`,
        url: `${SITE_URL}/leaderboard`,
        description: buildLeaderboardEmbedDescription(input),
        color: EMBED_COLOR,
        ...(fields.length > 0 ? { fields } : {}),
        footer: {
          text: `${SITE_NAME} · ${games} this month · ${ranked.length} ranked · ${scoring}`,
        },
        timestamp: now.toISOString(),
      },
    ],
  };
}
