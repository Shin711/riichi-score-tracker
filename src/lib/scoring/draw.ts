import type { Seat } from "@/lib/scoring/ledger";

const allSeats: Seat[] = ["E", "S", "W", "N"];

/**
 * Total points noten players pay to tenpai players on exhaustive draw (ノーテン罰符).
 * Split evenly: each tenpai receives pool ÷ tenpaiCount, each noten pays pool ÷ notenCount.
 * @see https://riichi.wiki/Exhaustive_draw
 */
export const DRAW_NOTEN_PENALTY_POOL = 3000;

/** Official payment table when 1–3 players are tenpai (pool always 3,000). */
const TENPAI_PAYMENT_BY_COUNT: Record<
  1 | 2 | 3,
  { perTenpai: number; perNoten: number; label: string }
> = {
  1: {
    perTenpai: 3000,
    perNoten: 1000,
    label: "3 noten × 1,000 → 1 tenpai +3,000",
  },
  2: {
    perTenpai: 1500,
    perNoten: 1500,
    label: "2 noten × 1,500 → 2 tenpai +1,500 each",
  },
  3: {
    perTenpai: 1000,
    perNoten: 3000,
    label: "1 noten × 3,000 → 3 tenpai +1,000 each",
  },
};

export type DrawKind =
  | "standard"
  | "four_riichi"
  | "four_kans"
  | "four_winds"
  | "kyuushu_kyuuhai"
  | "nagashi_mangan";

/** Mid-hand abortive draws (tochuu ryuukyoku) — not exhaustive wall draws. */
export function isAbortiveDrawKind(kind: DrawKind | undefined): boolean {
  return (
    kind === "four_riichi" ||
    kind === "four_kans" ||
    kind === "four_winds" ||
    kind === "kyuushu_kyuuhai"
  );
}

export function drawKindLabel(kind: DrawKind): string {
  switch (kind) {
    case "four_riichi":
      return "Four riichi (abort)";
    case "four_kans":
      return "Four kans (abort)";
    case "four_winds":
      return "Four winds (abort)";
    case "kyuushu_kyuuhai":
      return "Kyuushu kyuuhai (abort)";
    case "nagashi_mangan":
      return "Nagashi mangan";
    default:
      return "Standard draw";
  }
}

/** Hint text for abortive draw types (EMA / riichi.wiki tochuu ryuukyoku). */
export function describeAbortiveDrawRule(kind: DrawKind): string {
  switch (kind) {
    case "four_riichi":
      return "All four riichi — hand aborts. No payments · honba +1 · dealer continues. If the 4th riichi wins on discard, record a win instead.";
    case "four_kans":
      return "Four kans on the table — hand aborts. No payments · honba +1 · dealer continues.";
    case "four_winds":
      return "Four winds (same wind discarded in the opening round) — hand aborts. No payments · honba +1 · dealer continues.";
    case "kyuushu_kyuuhai":
      return "Nine terminals/honors after first draw (optional mulligan) — hand aborts. No payments · honba +1 · dealer continues. Not allowed after any call.";
    default:
      return "";
  }
}

/**
 * Standard ryuukyoku: noten players pay 3,000 total, divided among tenpai players.
 * Each noten pays pool ÷ notenCount; each tenpai receives pool ÷ tenpaiCount.
 */
export function computeExhaustiveDrawDeltas(tenpaiSeats: Seat[]): Record<Seat, number> | null {
  const tenpai = new Set(tenpaiSeats);
  const tenpaiCount = tenpai.size;

  if (tenpaiCount === 0 || tenpaiCount === 4) {
    return null;
  }

  const row = TENPAI_PAYMENT_BY_COUNT[tenpaiCount as 1 | 2 | 3];
  if (!row) {
    throw new Error("Invalid tenpai count for draw payment.");
  }

  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };

  for (const seat of allSeats) {
    if (tenpai.has(seat)) {
      deltas[seat] = row.perTenpai;
    } else {
      deltas[seat] = -row.perNoten;
    }
  }

  return deltas;
}

/**
 * Nagashi mangan at exhaustive draw: mangan tsumo payment (replaces tenpai exchanges).
 * @see https://riichi.wiki/Nagashi_mangan
 */
export function computeNagashiManganDeltas(
  winner: Seat,
  dealerSeat: Seat
): Record<Seat, number> {
  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  const winnerIsDealer = winner === dealerSeat;

  if (winnerIsDealer) {
    for (const seat of allSeats) {
      if (seat !== winner) deltas[seat] = -4000;
    }
    deltas[winner] = 12000;
    return deltas;
  }

  for (const seat of allSeats) {
    if (seat === winner) continue;
    deltas[seat] = seat === dealerSeat ? -4000 : -2000;
  }
  deltas[winner] = 8000;
  return deltas;
}

export function formatDrawPaymentPreview(
  deltas: Record<Seat, number> | null,
  seatNames: Record<Seat, string>,
  seatLabel: (s: Seat) => string,
  options?: { emptyMessage?: string }
): string {
  if (!deltas) {
    return options?.emptyMessage ?? "All four tenpai or all four noten — no point payments.";
  }

  const parts = allSeats
    .filter((s) => (deltas[s] ?? 0) !== 0)
    .map((s) => {
      const name = seatNames[s]?.trim();
      const label = name ? `${seatLabel(s)} (${name})` : seatLabel(s);
      const pts = deltas[s] ?? 0;
      const sign = pts > 0 ? "+" : "";
      return `${label} ${sign}${pts.toLocaleString()}`;
    });

  return parts.join(" · ");
}

export function describeStandardDrawRule(tenpaiCount: number): string {
  if (tenpaiCount === 0) {
    return "All noten — no payments. Dealer passes · honba +1.";
  }
  if (tenpaiCount === 4) {
    return "All tenpai — no payments. Dealer continues · honba +1.";
  }
  const row = TENPAI_PAYMENT_BY_COUNT[tenpaiCount as 1 | 2 | 3];
  if (!row) return "Select who was tenpai.";
  return `Noten penalty ${DRAW_NOTEN_PENALTY_POOL.toLocaleString()} total — ${row.label}.`;
}
