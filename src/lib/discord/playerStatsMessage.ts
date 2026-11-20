import { InteractionResponseType } from "@/lib/discord/interactions";
import type { DiscordEmbed } from "@/lib/discord/webhook";
import type { PlayerRivalry, RivalPointsLine, RivalTableLine } from "@/lib/leaderboard/rivalries";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** Club gold, matching the site header. */
const EMBED_COLOR = 0xd4a24c;

const MAX_FIELD_VALUE = 1024;
const TOP = 5;
const RANK_BADGES = ["🥇", "🥈", "🥉"] as const;

function formatPoints(points: number): string {
  return points.toLocaleString("en-US");
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function titleName(name: string): string {
  return name.length > 80 ? `${name.slice(0, 79)}…` : name;
}

function rankBadge(index: number): string {
  return RANK_BADGES[index] ?? `\`${index + 1}\``;
}

function pointsLine(line: RivalPointsLine, kind: "fed" | "won"): string {
  if (kind === "fed") {
    return `**${line.displayName}** — \`${formatPoints(line.points)}\` · ${plural(line.count, "deal-in")}`;
  }
  return `**${line.displayName}** — **${line.count}** ron · \`${formatPoints(line.points)}\``;
}

function tableLine(line: RivalTableLine): string {
  const pct = line.games > 0 ? Math.round((line.wins / line.games) * 100) : 0;
  const noun = line.games === 1 ? "game" : "games";
  return `**${line.displayName}** — **${line.wins}/${line.games}** ${noun} (\`${pct}%\`)`;
}

function listFieldValue<T>(rows: T[], render: (row: T) => string): string {
  const shown = rows.slice(0, TOP);
  const lines = shown.map((row, index) => `${rankBadge(index)} ${render(row)}`);
  const hidden = rows.length - shown.length;
  if (hidden > 0) lines.push(`*…and ${hidden} more*`);
  const value = lines.join("\n");
  return value.length > MAX_FIELD_VALUE ? `${value.slice(0, MAX_FIELD_VALUE - 1)}…` : value;
}

function emptyHands(rivalry: PlayerRivalry, kind: "fed" | "won"): string {
  if (rivalry.gamesWithHands === 0) return "*No hand logs for these games.*";
  return kind === "fed" ? "*No recorded deal-ins.*" : "*No recorded rons.*";
}

/** Summary line at the top of the `/player` embed. */
export function buildPlayerStatsDescription(rivalry: PlayerRivalry): string {
  if (rivalry.games === 0) return "No games on this month's leaderboard.";

  return [
    `🎲 **${rivalry.games}** ${rivalry.games === 1 ? "game" : "games"}`,
    `⚡ **${rivalry.ron}** ron`,
    `✨ **${rivalry.tsumo}** tsumo`,
    `💥 **${rivalry.dealIns}** ${rivalry.dealIns === 1 ? "deal-in" : "deal-ins"}`,
  ].join("  ·  ");
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

  const fields =
    rivalry.games > 0
      ? [
          {
            name: "💥 Fed the most points to",
            value:
              rivalry.fed.length > 0
                ? listFieldValue(rivalry.fed, (line) => pointsLine(line, "fed"))
                : emptyHands(rivalry, "fed"),
          },
          {
            name: "🎯 Won the most off",
            value:
              rivalry.wonOff.length > 0
                ? listFieldValue(rivalry.wonOff, (line) => pointsLine(line, "won"))
                : emptyHands(rivalry, "won"),
          },
          {
            name: "🏆 Beat most often",
            value:
              rivalry.beat.length > 0
                ? listFieldValue(rivalry.beat, tableLine)
                : "*Did not place above anyone.*",
          },
        ]
      : undefined;

  return {
    title: `🀄 ${titleName(rivalry.displayName)} · ${periodLabel}`,
    url: `${SITE_URL}/leaderboard`,
    description: buildPlayerStatsDescription(rivalry),
    color: EMBED_COLOR,
    ...(fields ? { fields } : {}),
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
