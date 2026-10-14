import { renderTable } from "@/lib/discord/leaderboardMessage";
import type { DiscordWebhookPayload } from "@/lib/discord/webhook";
import type { ImportedGameRow } from "@/lib/imports/types";
import { importedGameResults } from "@/lib/leaderboard/gameResults";
import { formatPointsValue } from "@/lib/leaderboard/points";
import { formatTimezoneLabel, LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";
import type { MajsoulGameStats, MajsoulWinningHand } from "@/lib/majsoul/stats";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** Club gold, matching the site header. */
const EMBED_COLOR = 0xd4a24c;

const MAX_FIELD_VALUE = 1024;
const MAX_NAME_WIDTH = 14;

export type GameLogRow = Pick<
  ImportedGameRow,
  "played_at" | "starting_points" | "entries_json" | "mjs_paipu_url"
>;

function truncateName(name: string): string {
  return name.length > MAX_NAME_WIDTH ? `${name.slice(0, MAX_NAME_WIDTH - 1)}…` : name;
}

function formatScore(score: number): string {
  return score.toLocaleString("en-US");
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatPlayedAt(playedAt: string): string {
  const formatted = new Date(playedAt).toLocaleString("en-US", {
    timeZone: LEADERBOARD_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatted} ${formatTimezoneLabel()}`;
}

/** Limit-hand name, or null below mangan. */
function limitName(hand: MajsoulWinningHand): string | null {
  if (hand.yakuman) return hand.han > 1 ? `${hand.han}× yakuman` : "Yakuman";
  if (hand.han >= 13) return "Kazoe yakuman";
  if (hand.han >= 11) return "Sanbaiman";
  if (hand.han >= 8) return "Baiman";
  if (hand.han >= 6) return "Haneman";
  if (hand.han === 5 || (hand.han === 4 && hand.fu >= 40) || (hand.han === 3 && hand.fu >= 70)) {
    return "Mangan";
  }
  return null;
}

function biggestHandLine(hand: MajsoulWinningHand, nameOf: (seat: number) => string): string {
  const hanFu = `${hand.han} han ${hand.fu} fu`;
  const limit = limitName(hand);
  const value = hand.yakuman ? limit : limit ? `${limit}, ${hanFu}` : hanFu;
  const how =
    hand.tsumo || hand.dealInSeat === null ? "tsumo" : `ron off ${nameOf(hand.dealInSeat)}`;
  return `Biggest hand: **${nameOf(hand.seat)}** — ${formatScore(hand.points)} (${value}), ${how}`;
}

/**
 * Body of the "Mahjong Soul stats" field. `stats.seats[n].seat` must index
 * `entries_json` (true for games imported straight from a log).
 */
function statsValue(row: GameLogRow, stats: MajsoulGameStats): string {
  const { seats } = importedGameResults(row);
  const nameOf = (seat: number) => row.entries_json[seat]?.display_name ?? `Seat ${seat + 1}`;
  const bySeat = new Map(stats.seats.map((seat) => [seat.seat, seat]));

  const lines = seats.flatMap((result) => {
    const seat = bySeat.get(result.seatIndex);
    if (!seat) return [];
    const wins =
      seat.tsumo > 0 ? `${plural(seat.wins, "win")} (${seat.tsumo} tsumo)` : plural(seat.wins, "win");
    return [
      `**${result.display_name}** — ${wins} · ${plural(seat.dealIns, "deal-in")} · ${seat.riichi} riichi · ${plural(seat.calls, "call")}`,
    ];
  });

  if (stats.biggestHand) lines.push(biggestHandLine(stats.biggestHand, nameOf));
  lines.push(
    stats.draws > 0
      ? `${plural(stats.hands, "hand")} · ${plural(stats.draws, "draw")}`
      : plural(stats.hands, "hand")
  );

  const value = lines.join("\n");
  return value.length > MAX_FIELD_VALUE ? `${value.slice(0, MAX_FIELD_VALUE - 1)}…` : value;
}

/** Final standings of one game as a monospace table, in placement order. */
export function buildGameLogTable(row: GameLogRow): string {
  const { usesUma, seats } = importedGameResults(row);

  const headers = usesUma ? ["#", "Player", "Score", "Uma", "Net"] : ["#", "Player", "Score", "Net"];
  const alignRight = usesUma ? [true, false, true, true, true] : [true, false, true, true];
  const rows = seats.map((seat) => {
    const cells = [String(seat.placement), truncateName(seat.display_name), formatScore(seat.final_score)];
    if (usesUma) cells.push(formatPointsValue(seat.uma ?? 0, 0));
    cells.push(formatPointsValue(seat.net));
    return cells;
  });

  return renderTable(headers, rows, alignRight);
}

export function buildGameLogWebhookPayload(
  row: GameLogRow,
  stats: MajsoulGameStats | null = null
): DiscordWebhookPayload {
  const fields = stats ? [{ name: "Mahjong Soul stats", value: statsValue(row, stats) }] : [];

  return {
    embeds: [
      {
        title: `Game · ${formatPlayedAt(row.played_at)}`,
        url: row.mjs_paipu_url ?? `${SITE_URL}/import`,
        description: `\`\`\`\n${buildGameLogTable(row)}\n\`\`\``,
        color: EMBED_COLOR,
        ...(fields.length > 0 ? { fields } : {}),
        footer: {
          text: `${SITE_NAME} · ${row.mjs_paipu_url ? "Mahjong Soul log" : "manual entry"}`,
        },
        timestamp: new Date(row.played_at).toISOString(),
      },
    ],
  };
}
