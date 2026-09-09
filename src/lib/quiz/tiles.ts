/**
 * Tile model for the daily scoring quiz.
 *
 * Two encodings are in play and they are easy to confuse:
 *  - **Notation** (`"3m"`, `"1z"`) — what we store in the database and print
 *    to Discord. Honors are `1z`–`7z` = E, S, W, N, haku, hatsu, chun.
 *  - **riichi-rs ids** (1–34) — what the solver wants. 1-indexed, so `1m` is
 *    `1`, not `0`. The deprecated `riichi-ts` used 0-indexed ids; do not carry
 *    that assumption over.
 */

export type Suit = "m" | "p" | "s" | "z";

/** A tile in standard notation, e.g. `"3m"` or `"7z"`. */
export type Tile = string;

export const SUITS: Suit[] = ["m", "p", "s", "z"];

/** Highest rank in each suit — honors stop at 7 (chun). */
export function maxRank(suit: Suit): number {
  return suit === "z" ? 7 : 9;
}

export function makeTile(rank: number, suit: Suit): Tile {
  return `${rank}${suit}`;
}

export function tileRank(tile: Tile): number {
  return Number(tile[0]);
}

export function tileSuit(tile: Tile): Suit {
  return tile[1] as Suit;
}

export function isHonor(tile: Tile): boolean {
  return tileSuit(tile) === "z";
}

export function isTerminal(tile: Tile): boolean {
  const rank = tileRank(tile);
  return !isHonor(tile) && (rank === 1 || rank === 9);
}

export function isTerminalOrHonor(tile: Tile): boolean {
  return isHonor(tile) || isTerminal(tile);
}

/** Every distinct tile, in display order: 1m–9m, 1p–9p, 1s–9s, 1z–7z. */
export function allTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= maxRank(suit); rank += 1) {
      tiles.push(makeTile(rank, suit));
    }
  }
  return tiles;
}

const SUIT_ORDER: Record<Suit, number> = { m: 0, p: 1, s: 2, z: 3 };

export function compareTiles(a: Tile, b: Tile): number {
  const suitDelta = SUIT_ORDER[tileSuit(a)] - SUIT_ORDER[tileSuit(b)];
  return suitDelta !== 0 ? suitDelta : tileRank(a) - tileRank(b);
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort(compareTiles);
}

/**
 * Groups tiles into standard notation runs: `["2m","3m","4m","5p"]` renders as
 * `"234m 5p"`. Input is sorted first so callers can pass any order.
 */
export function formatTiles(tiles: Tile[]): string {
  if (tiles.length === 0) return "";

  const sorted = sortTiles(tiles);
  const groups: string[] = [];
  let ranks: number[] = [];
  let suit = tileSuit(sorted[0]);

  const flush = () => {
    if (ranks.length > 0) groups.push(`${ranks.join("")}${suit}`);
    ranks = [];
  };

  for (const tile of sorted) {
    if (tileSuit(tile) !== suit) {
      flush();
      suit = tileSuit(tile);
    }
    ranks.push(tileRank(tile));
  }
  flush();

  return groups.join(" ");
}

const HONOR_NAMES = ["East", "South", "West", "North", "White", "Green", "Red"];

/** Human-readable single tile, e.g. `"3 man"` or `"Red dragon"`. */
export function describeTile(tile: Tile): string {
  const rank = tileRank(tile);
  if (isHonor(tile)) {
    const name = HONOR_NAMES[rank - 1] ?? "?";
    return rank <= 4 ? `${name} wind` : `${name} dragon`;
  }
  const suitName = { m: "man", p: "pin", s: "sou" }[tileSuit(tile) as "m" | "p" | "s"];
  return `${rank} ${suitName}`;
}

/**
 * The tile an indicator points to. Ranks wrap within their own group: 9→1 in
 * the number suits, N→E for winds, and chun→haku for dragons.
 *
 * The solver takes **actual dora tiles**, not indicators — passing an indicator
 * straight through silently scores zero dora, so always route through here.
 */
export function doraFromIndicator(indicator: Tile): Tile {
  const rank = tileRank(indicator);
  const suit = tileSuit(indicator);

  if (suit !== "z") return makeTile(rank === 9 ? 1 : rank + 1, suit);
  if (rank <= 4) return makeTile(rank === 4 ? 1 : rank + 1, "z"); // winds cycle E→S→W→N→E
  return makeTile(rank === 7 ? 5 : rank + 1, "z"); // dragons cycle haku→hatsu→chun→haku
}

/** riichi-rs tile id (1–34) for a notation tile. */
export function toSolverTile(tile: Tile): number {
  const rank = tileRank(tile);
  const base = { m: 0, p: 9, s: 18, z: 27 }[tileSuit(tile)];
  return base + rank;
}

export function toSolverTiles(tiles: Tile[]): number[] {
  return tiles.map(toSolverTile);
}

/** Inverse of {@link toSolverTile}. */
export function fromSolverTile(id: number): Tile {
  if (id >= 28) return makeTile(id - 27, "z");
  if (id >= 19) return makeTile(id - 18, "s");
  if (id >= 10) return makeTile(id - 9, "p");
  return makeTile(id, "m");
}

export type Wind = "east" | "south" | "west" | "north";

export const WINDS: Wind[] = ["east", "south", "west", "north"];

const WIND_TILES: Record<Wind, Tile> = {
  east: "1z",
  south: "2z",
  west: "3z",
  north: "4z",
};

export function windTile(wind: Wind): Tile {
  return WIND_TILES[wind];
}

const WIND_KANJI: Record<Wind, string> = {
  east: "東",
  south: "南",
  west: "西",
  north: "北",
};

export function windKanji(wind: Wind): string {
  return WIND_KANJI[wind];
}

export function windLabel(wind: Wind): string {
  return wind.charAt(0).toUpperCase() + wind.slice(1);
}
