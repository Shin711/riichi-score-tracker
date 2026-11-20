import { buildGameLogTable } from "@/lib/discord/gameLogMessage";
import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  TextInputStyle,
} from "@/lib/discord/interactions";
import { importSeatWindLabel, type ImportedGameEntry } from "@/lib/imports/types";
import {
  getLocalPartsInTimezone,
  LEADERBOARD_TIMEZONE,
  localTimeToUtcIso,
} from "@/lib/leaderboard/timezone";

/**
 * A game being entered through `/import`, before it is saved.
 *
 * Both ways in — a Mahjong Soul link, or typing the game in — end up as a draft
 * posted with Save / Edit / Cancel, so names and scores can be fixed in
 * Discord exactly like the site's form before anything reaches the leaderboard.
 */

export const SEAT_COUNT = 4;
export const DEFAULT_STARTING_POINTS = 25000;
const MAX_CHOMBO = 10;

export type DraftSeat = { name: string; score: number; isAi: boolean; chombo: number };

export type ImportDraft = {
  v: 1;
  /** Discord user who started it; only they can save, edit, or cancel. */
  ownerId: string;
  seats: DraftSeat[];
  playedAt: string;
  startingPoints: number;
  paipuUrl: string | null;
  /** From a Mahjong Soul preview: lets Save keep the hand log. */
  lookupUuid: string | null;
  previewToken: string | null;
  /** Scores as the log had them; editing a score turns the draft into a manual game. */
  logScores: number[] | null;
};

// ---------------------------------------------------------------- custom ids

const PREFIX = "imp";
export type ImportControl =
  | { action: "save" | "edit" | "cancel"; draftId: string }
  | { action: "modal"; draftId: string | null };

export const NEW_DRAFT = "new";

export function importControlId(action: ImportControl["action"], draftId: string | null): string {
  return `${PREFIX}:${action}:${draftId ?? NEW_DRAFT}`;
}

export function parseImportControlId(customId: string): ImportControl | null {
  const [prefix, action, id] = customId.split(":");
  if (prefix !== PREFIX || !id) return null;
  if (action === "modal") return { action, draftId: id === NEW_DRAFT ? null : id };
  if (action === "save" || action === "edit" || action === "cancel") {
    return id === NEW_DRAFT ? null : { action, draftId: id };
  }
  return null;
}

export function isImportControlId(customId: string | undefined): boolean {
  return !!customId && parseImportControlId(customId) !== null;
}

// ---------------------------------------------------------------- seat lines

const AI_NAMES = new Set(["ai", "bot", "cpu"]);

export class DraftInputError extends Error {}

/** `Alice 32000`, `Bob -1,200 c1`, `AI 25000`. */
export function parseSeatLine(raw: string, seatIndex: number): DraftSeat {
  const wind = importSeatWindLabel(seatIndex);
  const line = raw.trim().replace(/[−–—]/g, "-");
  const match = line.match(/^(.+?)\s+(-?\d[\d,]*)(?:\s+c(?:hombo)?\s*[x×]?\s*(\d+))?$/i);
  if (!match) {
    throw new DraftInputError(
      `${wind}: write a name then the final score, like \`Alice 32000\` (or \`AI 25000\` for a bot).`
    );
  }
  const name = match[1].trim();
  const score = Number(match[2].replace(/,/g, ""));
  const chombo = match[3] ? Number(match[3]) : 0;
  if (!Number.isSafeInteger(score)) throw new DraftInputError(`${wind}: that score isn't a number.`);
  if (chombo > MAX_CHOMBO) throw new DraftInputError(`${wind}: at most ${MAX_CHOMBO} chombo.`);
  if (name.length > 40) throw new DraftInputError(`${wind}: that name is too long.`);

  const isAi = AI_NAMES.has(name.toLowerCase());
  return { name: isAi ? "AI" : name, score, isAi, chombo: isAi ? 0 : chombo };
}

export function formatSeatLine(seat: DraftSeat): string {
  if (seat.isAi) return `AI ${seat.score}`;
  return `${seat.name} ${seat.score}${seat.chombo > 0 ? ` c${seat.chombo}` : ""}`;
}

// ---------------------------------------------------------------- played at

/** `2026-11-19 21:41`, Eastern — the round-trip form shown in the edit box. */
export function formatPlayedAtInput(iso: string): string {
  const p = getLocalPartsInTimezone(new Date(iso), LEADERBOARD_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Eastern wall-clock time → ISO. Accepts `2026-11-19 21:41`, `11/19 9:41pm`,
 * `11/19/2026 9:41 PM`. Blank keeps `fallbackIso`.
 */
export function parsePlayedAtInput(raw: string, fallbackIso: string, now = new Date()): string {
  const text = raw.trim();
  if (!text) return fallbackIso;
  const match = text.match(
    /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?)[ ,T]+(\d{1,2}):(\d{2})\s*(am|pm)?$/i
  );
  const bad = () =>
    new DraftInputError("Game ended: use a date and time like `2026-11-19 21:40` or `11/19 9:40pm`.");
  if (!match) throw bad();

  const nowParts = getLocalPartsInTimezone(now, LEADERBOARD_TIMEZONE);
  let year = Number(match[1] ?? match[6] ?? nowParts.year);
  if (year < 100) year += 2000;
  const month = Number(match[2] ?? match[4]);
  const day = Number(match[3] ?? match[5]);
  let hour = Number(match[7]);
  const minute = Number(match[8]);
  const meridiem = match[9]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) throw bad();
    hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) throw bad();

  const iso = localTimeToUtcIso(year, month, day, hour, minute, LEADERBOARD_TIMEZONE);
  if (new Date(iso).getTime() > now.getTime() + 60 * 60 * 1000) {
    throw new DraftInputError("Game ended: that time is in the future.");
  }
  return iso;
}

// ---------------------------------------------------------------- modal

export const FIELD_PLAYED_AT = "played_at";
export const seatFieldId = (index: number) => `seat_${index}`;

export function buildImportModal(draft: ImportDraft | null, draftId: string | null) {
  const seatInput = (index: number) => ({
    type: ComponentType.Label,
    label: `${importSeatWindLabel(index)} — name and final score`,
    description: index === 0 ? "e.g. Alice 32000 · Bob -1200 c1 (chombo) · AI 25000" : undefined,
    component: {
      type: ComponentType.TextInput,
      custom_id: seatFieldId(index),
      style: TextInputStyle.Short,
      placeholder: index === 0 ? "Alice 32000" : "Name 25000",
      required: true,
      max_length: 60,
      ...(draft ? { value: formatSeatLine(draft.seats[index]) } : {}),
    },
  });

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: importControlId("modal", draftId),
      title: draft ? "Edit game" : "Import a game",
      components: [
        ...Array.from({ length: SEAT_COUNT }, (_, index) => seatInput(index)),
        {
          type: ComponentType.Label,
          label: "Game ended (Eastern time)",
          description: "Leave blank for now. e.g. 2026-11-19 21:40 or 11/19 9:40pm",
          component: {
            type: ComponentType.TextInput,
            custom_id: FIELD_PLAYED_AT,
            style: TextInputStyle.Short,
            required: false,
            max_length: 30,
            placeholder: "2026-11-19 21:40",
            ...(draft ? { value: formatPlayedAtInput(draft.playedAt) } : {}),
          },
        },
      ],
    },
  };
}

/** Applies a submitted modal to a draft (or a blank one). Throws DraftInputError. */
export function draftFromModal(
  values: Record<string, string>,
  base: Omit<ImportDraft, "seats" | "playedAt"> & { playedAt?: string },
  now = new Date()
): ImportDraft {
  const seats = Array.from({ length: SEAT_COUNT }, (_, index) =>
    parseSeatLine(values[seatFieldId(index)] ?? "", index)
  );
  if (seats.filter((seat) => !seat.isAi).length < 2) {
    throw new DraftInputError("At least two seats need to be human players.");
  }
  const playedAt = parsePlayedAtInput(
    values[FIELD_PLAYED_AT] ?? "",
    base.playedAt ?? now.toISOString(),
    now
  );
  return { ...base, seats, playedAt };
}

/** True when the draft still has the log's scores and seats, so hand stats can be kept. */
export function draftMatchesLog(draft: ImportDraft): boolean {
  return (
    !!draft.logScores &&
    draft.logScores.length === draft.seats.length &&
    draft.seats.every((seat, index) => seat.score === draft.logScores![index])
  );
}

// ---------------------------------------------------------------- messages

export function draftEntries(draft: ImportDraft): ImportedGameEntry[] {
  return draft.seats.map((seat) => ({
    display_name: seat.isAi ? "AI" : seat.name,
    final_score: seat.score,
    is_ai: seat.isAi,
    ...(seat.chombo > 0 ? { chombo: seat.chombo } : {}),
  }));
}

export function formatPlayedAtLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: LEADERBOARD_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The draft as posted: standings, checks, and Save / Edit / Cancel. */
export function buildDraftMessage(draft: ImportDraft, draftId: string, newPlayerNames: string[]) {
  const table = buildGameLogTable({
    played_at: draft.playedAt,
    starting_points: draft.startingPoints,
    entries_json: draftEntries(draft),
    mjs_paipu_url: draft.paipuUrl,
  });
  const expected = draft.startingPoints * SEAT_COUNT;
  const total = draft.seats.reduce((sum, seat) => sum + seat.score, 0);
  const totalLine =
    total === expected
      ? `Table total ${total.toLocaleString("en-US")} ✓`
      : `Table total ${total.toLocaleString("en-US")} (expected ${expected.toLocaleString("en-US")} — fine if riichi sticks were left on the table)`;

  const lines = [
    `**Game to import** · started by <@${draft.ownerId}>`,
    `${formatPlayedAtLabel(draft.playedAt)} ET`,
    "```",
    table,
    "```",
    totalLine,
  ];
  if (newPlayerNames.length > 0) {
    lines.push(
      `New to the club roster (will be added): ${newPlayerNames.map((name) => `**${name}**`).join(", ")}`
    );
  }
  if (draft.paipuUrl) {
    lines.push(
      `[Mahjong Soul log](<${draft.paipuUrl}>)${draft.logScores && !draftMatchesLog(draft) ? " · scores edited, saved as a manual game" : ""}`
    );
  }
  lines.push("", "Check the names match the club leaderboard, then **Save**. Nothing is recorded until then.");

  return {
    content: lines.join("\n"),
    allowed_mentions: { parse: [] as string[] },
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          { type: ComponentType.Button, style: ButtonStyle.Success, label: "Save", custom_id: importControlId("save", draftId) },
          { type: ComponentType.Button, style: ButtonStyle.Primary, label: "Edit names / scores", custom_id: importControlId("edit", draftId) },
          { type: ComponentType.Button, style: ButtonStyle.Secondary, label: "Cancel", custom_id: importControlId("cancel", draftId) },
        ],
      },
    ],
  };
}
