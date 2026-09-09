/**
 * Draws the quiz hand as a PNG.
 *
 * Deliberately contains **no text**. Rendering text through sharp means SVG
 * text, which needs fontconfig and installed fonts — fragile in a serverless
 * runtime and liable to fail differently in production than locally. The round,
 * seat and win type live in the embed instead, where Discord renders them.
 *
 * Layout:
 *   - a dora wall on top, face-down except the indicator
 *   - the hand on one line: concealed tiles, winning tile, then called melds
 *
 * Meld type is drawn, not just implied: a called tile lies on its side and a
 * closed kan shows its outer tiles face-down. That distinction changes the fu
 * and whether the hand is closed, so it has to be readable from the picture.
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import type { Meld, QuizHand } from "@/lib/quiz/hand";
import { sortTiles } from "@/lib/quiz/tiles";

const ASSET_DIR = path.join(process.cwd(), "src", "assets", "tiles");

/**
 * Discord scales an embed image to fit roughly 550x300, so the size a tile
 * actually appears at is about `550 / tiles-across` and does not depend on how
 * large this source image is — a wider strip is simply scaled down harder.
 *
 * These values therefore buy sharpness when a reader opens the image full size,
 * not size in the channel. The only lever on displayed size is how many tiles
 * share a row, and the hand is deliberately kept on one line (see layoutRows).
 */
const TILE_W = 110;
const TILE_H = 147;
/** The dora wall is drawn smaller so it reads as background information. */
const WALL_W = 62;
const WALL_H = 83;

const PADDING = 20;
/**
 * Tiles need daylight between them. The tile art has a pale body and no outer
 * border, so butted together a run reads as one continuous strip and counting
 * `22333445s` off it becomes guesswork.
 */
const TILE_GAP = 5;
const WALL_TILE_GAP = 3;
/** Separates tile groups on a row: the winning tile, and each called meld. */
const GROUP_GAP = 34;
const ROW_GAP = 14;
/** Tiles either side of the flipped indicator, as on a real wall. */
const WALL_LENGTH = 7;
const INDICATOR_SLOT = 2;

type Layer = { input: Buffer; left: number; top: number };

const cache = new Map<string, Buffer>();

const BACK_TILE = "back";

async function tileImage(
  name: string,
  width: number,
  height: number,
  rotated = false
): Promise<Buffer> {
  const key = `${name}@${width}x${height}${rotated ? "r" : ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const file = path.join(ASSET_DIR, `${name}.png`);
  const pipeline = sharp(await fs.readFile(file)).resize(width, height, { fit: "fill" });

  // The stock tile back is a saturated red that pulls the eye away from the
  // hand. Knocking the saturation back lets the wall sit behind the tiles that
  // actually matter, and makes the face-up indicator stand out among them.
  if (name === BACK_TILE) pipeline.modulate({ saturation: 0.5, brightness: 0.95 });

  // Rotate after resizing, so the tile keeps the same proportions on its side.
  if (rotated) pipeline.rotate(90);

  const buffer = await pipeline.png().toBuffer();
  cache.set(key, buffer);
  return buffer;
}

/**
 * A tile to draw. `rotated` lays it on its side, the table convention marking
 * the tile a meld was called on.
 */
type TileSpec = { name: string; rotated?: boolean };

function upright(names: string[]): TileSpec[] {
  return names.map((name) => ({ name }));
}

/** Lays tiles left to right from `left`, returning where the row ends. */
async function placeRow(
  tiles: TileSpec[],
  left: number,
  top: number,
  width: number,
  height: number,
  gap: number,
  layers: Layer[]
): Promise<number> {
  let x = left;
  for (const tile of tiles) {
    const image = await tileImage(tile.name, width, height, tile.rotated);
    // A rotated tile is wider than it is tall; sit it on the row's baseline so
    // the melds line up along the bottom the way they do on the table.
    const drawnWidth = tile.rotated ? height : width;
    const offsetTop = tile.rotated ? height - width : 0;
    layers.push({ input: image, left: x, top: top + offsetTop });
    x += drawnWidth + gap;
  }
  // Trailing gap is not part of the group's footprint.
  return tiles.length > 0 ? x - gap : x;
}

/**
 * Tiles for one called meld, following table convention so the type is readable
 * from the picture — which it has to be, because meld type changes both the fu
 * and whether the hand counts as closed.
 *
 *   - chi / pon / open kan: the called tile lies on its side
 *   - closed kan: the two outer tiles sit face-down
 */
function meldTiles(meld: Meld): TileSpec[] {
  const tiles = sortTiles(meld.tiles);

  if (meld.kind === "ankan") {
    return [
      { name: BACK_TILE },
      { name: tiles[1] },
      { name: tiles[2] },
      { name: BACK_TILE },
    ];
  }

  const [called, ...rest] = tiles;
  return [{ name: called, rotated: true }, ...upright(rest)];
}

/** One drawn line of the hand: tile groups separated by a wider gap. */
type Row = { groups: TileSpec[][] };

/**
 * The whole hand on a single line, the way it sits on the table: concealed
 * tiles, then the winning tile set apart, then any called melds.
 *
 * This is the conventional presentation and the one people expect, at the cost
 * of on-screen size — see the note on TILE_W. Wrapping the concealed tiles onto
 * a second row would roughly double the displayed tile size if that trade ever
 * looks worth making again.
 */
function layoutRows(hand: QuizHand): Row[] {
  return [
    {
      groups: [
        upright(sortTiles(hand.concealed)),
        upright([hand.winningTile]),
        ...hand.melds.map(meldTiles),
      ],
    },
  ];
}

export async function renderHandImage(hand: QuizHand): Promise<Buffer> {
  const layers: Layer[] = [];

  // --- dora wall -----------------------------------------------------------
  const wallTop = PADDING;
  const wall = upright(
    Array.from({ length: WALL_LENGTH }, (_, slot) =>
      slot === INDICATOR_SLOT ? hand.doraIndicator : BACK_TILE
    )
  );
  const wallRight = await placeRow(
    wall,
    PADDING,
    wallTop,
    WALL_W,
    WALL_H,
    WALL_TILE_GAP,
    layers
  );

  // --- hand ----------------------------------------------------------------
  let widest = wallRight;
  let top = wallTop + WALL_H + ROW_GAP;

  for (const row of layoutRows(hand)) {
    let cursor = PADDING;
    let first = true;
    for (const group of row.groups) {
      if (group.length === 0) continue;
      if (!first) cursor += GROUP_GAP;
      cursor = await placeRow(group, cursor, top, TILE_W, TILE_H, TILE_GAP, layers);
      first = false;
    }
    widest = Math.max(widest, cursor);
    top += TILE_H + ROW_GAP;
  }

  const width = widest + PADDING;
  const height = top - ROW_GAP + PADDING;

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      // Transparent, so the image sits on whatever Discord theme the viewer uses.
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Test seam: drops the resized-tile cache. */
export function resetTileImageCache(): void {
  cache.clear();
}
