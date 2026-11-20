import { InteractionResponseType } from "@/lib/discord/interactions";
import type { DiscordEmbed } from "@/lib/discord/webhook";
import type { PlayerRivalry, RivalPointsLine, RivalTableLine } from "@/lib/leaderboard/rivalries";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** Club gold, matching the site header. */
const EMBED_COLOR = 0xd4a24c;

const MAX_DESCRIPTION = 4096;
const TOP = 5;

function formatPoints(points: number): string {
  return points.toLocaleString("en-US");
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function titleName(name: string): string {
  return name.length > 80 ? `${name.slice(0, 79)}…` : name;
}

function pointsLine(line: RivalPointsLine, kind: "fed" | "won"): string {
  if (kind === "fed") {
    return `**${line.displayName}** — ${formatPoints(line.points)} over ${plural(line.count, "deal-in")}`;
  }
  return `**${line.displayName}** — ${plural(line.count, "ron", "ron")}, ${formatPoints(line.points)}`;
}

function tableLine(line: RivalTableLine): string {
  return `**${line.displayName}** — ${line.wins} of ${plural(line.games, "game")}`;
}

function capped(lines: string[], hidden: number): string {
  if (hidden <= 0) return lines.join("\n");
  return [...lines, `…and ${hidden} more`].join("\n");
}

function listSection<T>(rows: T[], render: (row: T) => string, numbered: boolean): string {
  const shown = rows.slice(0, TOP);
  const lines = shown.map((row, index) => (numbered ? `${index + 1}. ${render(row)}` : render(row)));
  return capped(lines, rows.length - shown.length);
}

function emptyHands(rivalry: PlayerRivalry, kind: "fed" | "won"): string {
  if (rivalry.gamesWithHands === 0) return "No hand logs for these games.";
  return kind === "fed" ? "No recorded deal-ins." : "No recorded rons.";
}

function header(rivalry: PlayerRivalry): string {
  return [
    plural(rivalry.games, "game"),
    plural(rivalry.ron, "ron", "ron"),
    plural(rivalry.tsumo, "tsumo", "tsumo"),
    plural(rivalry.dealIns, "deal-in"),
  ].join(" · ");
}

/** Embed body for `/player`. Also what the tests lock the wording to. */
export function buildPlayerStatsDescription(rivalry: PlayerRivalry): string {
  if (rivalry.games === 0) return "No games in this period.";

  const fed =
    rivalry.fed.length > 0
      ? listSection(rivalry.fed, (line) => pointsLine(line, "fed"), true)
      : emptyHands(rivalry, "fed");
  const won =
    rivalry.wonOff.length > 0
      ? listSection(rivalry.wonOff, (line) => pointsLine(line, "won"), true)
      : emptyHands(rivalry, "won");
  const beat =
    rivalry.beat.length > 0
      ? listSection(rivalry.beat, tableLine, false)
      : "Did not place above anyone.";

  const description = [
    header(rivalry),
    "",
    "**Fed the most points to**",
    fed,
    "",
    "**Won the most off**",
    won,
    "",
    "**Beat most often**",
    beat,
  ].join("\n");

  return description.length > MAX_DESCRIPTION
    ? `${description.slice(0, MAX_DESCRIPTION - 1)}…`
    : description;
}

export function buildPlayerStatsEmbed(
  rivalry: PlayerRivalry,
  periodLabel: string,
  now = new Date()
): DiscordEmbed {
  const coverage =
    rivalry.games > 0
      ? `Deal-ins cover ${rivalry.gamesWithHands} of ${plural(rivalry.games, "game")}`
      : null;

  return {
    title: `${titleName(rivalry.displayName)} · ${periodLabel}`,
    url: `${SITE_URL}/leaderboard`,
    description: buildPlayerStatsDescription(rivalry),
    color: EMBED_COLOR,
    footer: { text: coverage ? `${SITE_NAME} · ${coverage}` : SITE_NAME },
    timestamp: now.toISOString(),
  };
}

/** Public channel reply. Names are not parsed as mentions. */
export function buildPlayerStatsResponse(
  rivalry: PlayerRivalry,
  periodLabel: string,
  now = new Date()
) {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [buildPlayerStatsEmbed(rivalry, periodLabel, now)],
      allowed_mentions: { parse: [] as string[] },
    },
  };
}
