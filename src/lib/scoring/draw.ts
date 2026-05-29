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

/** Nagashi mangan at exhaustive draw: each opponent pays non-dealer mangan (8,000). */
export const NAGASHI_MANGAN_EACH = 8000;

export type DrawKind = "standard" | "four_riichi" | "four_kans" | "nagashi_mangan";

export function drawKindLabel(kind: DrawKind): string {
  switch (kind) {
    case "four_riichi":
      return "Four riichi (abort)";
    case "four_kans":
      return "Four kans (abort)";
    case "nagashi_mangan":
      return "Nagashi mangan";
    default:
      return "Standard draw";
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

/** Nagashi mangan: winner collects 8,000 from each of the other three players. */
export function computeNagashiManganDeltas(winner: Seat): Record<Seat, number> {
  const deltas: Record<Seat, number> = { E: 0, S: 0, W: 0, N: 0 };
  for (const seat of allSeats) {
    if (seat !== winner) deltas[seat] = -NAGASHI_MANGAN_EACH;
  }
  deltas[winner] = NAGASHI_MANGAN_EACH * 3;
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
