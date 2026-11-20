import { InteractionResponseType } from "@/lib/discord/interactions";
import type { DiscordEmbed } from "@/lib/discord/webhook";
import { formatLeaderboardAverage, formatPointsValue } from "@/lib/leaderboard/points";
import type {
  PlayerLeaderboardStanding,
  PlayerRivalry,
  RivalMatchup,
} from "@/lib/leaderboard/rivalries";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** Club gold, matching the site header. */
const EMBED_COLOR = 0xd4a24c;

const MAX_FIELD_VALUE = 1024;
const TOP = 5;
const RANK_BADGES = ["🥇", "🥈", "🥉"] as const;

function formatScore(score: number): string {
  return score.toLocaleString("en-US");
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

function matchupLine(line: RivalMatchup): string {
  const pct = line.games > 0 ? Math.round((line.wins / line.games) * 100) : 0;
  return `**${line.displayName}** — **${line.wins}–${line.losses}** (\`${pct}%\`)`;
}

function listFieldValue(rows: RivalMatchup[], emptyText: string): string {
  if (rows.length === 0) return emptyText;
  const shown = rows.slice(0, TOP);
  const lines = shown.map((row, index) => `${rankBadge(index)} ${matchupLine(row)}`);
  const hidden = rows.length - shown.length;
  if (hidden > 0) lines.push(`*…and ${hidden} more*`);
  const value = lines.join("\n");
  return value.length > MAX_FIELD_VALUE ? `${value.slice(0, MAX_FIELD_VALUE - 1)}…` : value;
}

function placementsFieldValue(rivalry: PlayerRivalry): string {
  const [first, second, third, fourth] = rivalry.placements;
  const top2Pct = Math.round(((first + second) / rivalry.games) * 100);
  const fourthPct = Math.round((fourth / rivalry.games) * 100);

  const lines = [
    `🥇 **${first}**  ·  🥈 **${second}**  ·  🥉 **${third}**  ·  \`4th\` **${fourth}**`,
    `Avg place \`${rivalry.avgPlacement.toFixed(2)}\`  ·  Top 2 \`${top2Pct}%\`  ·  4th \`${fourthPct}%\``,
  ];

  if (rivalry.highScore !== null && rivalry.lowScore !== null) {
    lines.push(
      `🔥 High \`${formatScore(rivalry.highScore)}\`  ·  🥶 Low \`${formatScore(rivalry.lowScore)}\``
    );
  }
  return lines.join("\n");
}

/** Summary line at the top of the `/player` embed. */
export function buildPlayerStatsDescription(
  rivalry: PlayerRivalry,
  standing?: PlayerLeaderboardStanding | null
): string {
  if (rivalry.games === 0) return "No games on this month's leaderboard.";

  const points = standing ? standing.rating : rivalry.netPoints;
  const trendIcon = points >= 0 ? "📈" : "📉";
  const ptsText = `${formatPointsValue(points)} pts (\`${formatLeaderboardAverage(rivalry.netPoints, rivalry.games)}\`/game)`;

  const parts: string[] = [];
  if (standing?.rank) {
    parts.push(`🏅 **#${standing.rank}** of ${standing.rankedCount}`);
  }
  parts.push(
    standing && standing.rank === null && standing.gamesToRank > 0
      ? `🎲 **${plural(rivalry.games, "game")}** (${standing.gamesToRank} to rank)`
      : `🎲 **${plural(rivalry.games, "game")}**`
  );
  parts.push(`${trendIcon} **${ptsText}**`);

  return parts.join("  ·  ");
}

export function buildPlayerStatsEmbed(
  rivalry: PlayerRivalry,
  periodLabel: string,
  now = new Date(),
  standing?: PlayerLeaderboardStanding | null
): DiscordEmbed {
  const fields =
    rivalry.games > 0
      ? [
          {
            name: "📊 Placements & Scores",
            value: placementsFieldValue(rivalry),
          },
          {
            name: "🏆 Best matchups",
            value: listFieldValue(rivalry.bestMatchups, "*No winning head-to-head records yet.*"),
          },
          {
            name: "😈 Toughest matchups",
            value: listFieldValue(
              rivalry.toughestMatchups,
              "*No losing head-to-head records yet.*"
            ),
          },
        ]
      : undefined;

  return {
    title: `🀄 ${titleName(rivalry.displayName)} · ${periodLabel}`,
    url: `${SITE_URL}/leaderboard`,
    description: buildPlayerStatsDescription(rivalry, standing),
    color: EMBED_COLOR,
    ...(fields ? { fields } : {}),
    footer: { text: `${SITE_NAME} · Current month's leaderboard` },
    timestamp: now.toISOString(),
  };
}

/** Public channel reply. Names are not parsed as mentions. */
export function buildPlayerStatsResponse(
  rivalry: PlayerRivalry,
  periodLabel: string,
  now = new Date(),
  standing?: PlayerLeaderboardStanding | null
) {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [buildPlayerStatsEmbed(rivalry, periodLabel, now, standing)],
      allowed_mentions: { parse: [] as string[] },
    },
  };
}
