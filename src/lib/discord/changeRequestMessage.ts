import { buildGameLogTable } from "@/lib/discord/gameLogMessage";
import { ButtonStyle, ComponentType } from "@/lib/discord/interactions";
import type { ImportedGameEntry } from "@/lib/imports/types";
import { formatTimezoneLabel, LEADERBOARD_TIMEZONE } from "@/lib/leaderboard/timezone";
import { SITE_URL } from "@/lib/site";

export type ChangeRequestKind = "edit" | "delete";
export type ChangeRequestDecision = "approve" | "reject";

/** The parts of a game a change request shows and compares. */
export type GameSnapshot = {
  played_at: string;
  starting_points: number;
  entries_json: ImportedGameEntry[];
  mjs_paipu_url: string | null;
};

const CUSTOM_ID_PATTERN = /^gcr:(approve|reject):([0-9a-f-]{36})$/;

/** Amber: waiting on someone. */
const PENDING_COLOR = 0xe0a030;

export function changeRequestCustomId(decision: ChangeRequestDecision, requestId: string): string {
  return `gcr:${decision}:${requestId}`;
}

export function parseChangeRequestCustomId(
  customId: string
): { decision: ChangeRequestDecision; requestId: string } | null {
  const match = CUSTOM_ID_PATTERN.exec(customId);
  if (!match) return null;
  return { decision: match[1] as ChangeRequestDecision, requestId: match[2] };
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

function codeBlock(text: string): string {
  return `\`\`\`\n${text}\n\`\`\``;
}

/** What changed besides the seats, as short lines ("Starting stack: 25,000 → 30,000"). */
function detailChanges(before: GameSnapshot, after: GameSnapshot): string[] {
  const lines: string[] = [];
  if (before.played_at !== after.played_at) {
    lines.push(`Played: ${formatPlayedAt(before.played_at)} → ${formatPlayedAt(after.played_at)}`);
  }
  if (before.starting_points !== after.starting_points) {
    lines.push(
      `Starting stack: ${before.starting_points.toLocaleString("en-US")} → ${after.starting_points.toLocaleString("en-US")}`
    );
  }
  if ((before.mjs_paipu_url ?? "") !== (after.mjs_paipu_url ?? "")) {
    lines.push(`Log link: ${before.mjs_paipu_url ?? "none"} → ${after.mjs_paipu_url ?? "none"}`);
  }
  return lines;
}

/** The approval post: what would change, plus Approve / Reject buttons. */
export function buildChangeRequestMessage(input: {
  requestId: string;
  kind: ChangeRequestKind;
  before: GameSnapshot;
  after: GameSnapshot | null;
  requestedBy: string | null;
}) {
  const { requestId, kind, before, after } = input;
  const title = `${kind === "edit" ? "Edit" : "Removal"} requested · game from ${formatPlayedAt(before.played_at)}`;

  const description =
    kind === "edit" && after
      ? [
          "**Now**",
          codeBlock(buildGameLogTable(before)),
          "**After this edit**",
          codeBlock(buildGameLogTable(after)),
          ...detailChanges(before, after),
        ].join("\n")
      : ["This game would be **removed** from the leaderboard.", codeBlock(buildGameLogTable(before))].join(
          "\n"
        );

  return {
    embeds: [
      {
        title,
        url: `${SITE_URL}/import`,
        description: description.slice(0, 4000),
        color: PENDING_COLOR,
        footer: {
          text: `Requested ${input.requestedBy ? `by ${input.requestedBy}` : "anonymously"} on the website`,
        },
      },
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Success,
            label: kind === "edit" ? "Approve edit" : "Approve removal",
            custom_id: changeRequestCustomId("approve", requestId),
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Danger,
            label: "Reject",
            custom_id: changeRequestCustomId("reject", requestId),
          },
        ],
      },
    ],
  };
}

/** The line that replaces the buttons once a request is settled. */
export function changeRequestOutcomeLine(
  status: "approved" | "rejected" | "stale",
  kind: ChangeRequestKind,
  deciderId: string | null
): string {
  const by = deciderId ? ` by <@${deciderId}>` : "";
  if (status === "approved") {
    return kind === "edit" ? `✅ Edit approved${by} and applied.` : `✅ Removal approved${by}; game removed.`;
  }
  if (status === "rejected") return `❌ Rejected${by}. Nothing was changed.`;
  return "⚠️ Not applied: the game changed or was removed after this request was made. Ask for a new edit if it's still needed.";
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/** True when the game is unchanged since the snapshot (key order and timestamp format ignored). */
export function sameGameSnapshot(a: GameSnapshot, b: GameSnapshot): boolean {
  const normalize = (s: GameSnapshot) =>
    JSON.stringify(
      canonical({
        played_at: new Date(s.played_at).toISOString(),
        starting_points: s.starting_points,
        entries_json: s.entries_json ?? [],
        mjs_paipu_url: s.mjs_paipu_url ?? null,
      })
    );
  return normalize(a) === normalize(b);
}

export function snapshotOf(row: GameSnapshot): GameSnapshot {
  return {
    played_at: row.played_at,
    starting_points: row.starting_points,
    entries_json: row.entries_json ?? [],
    mjs_paipu_url: row.mjs_paipu_url ?? null,
  };
}
