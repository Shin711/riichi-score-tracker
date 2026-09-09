/**
 * Vendors the tile images used to draw the daily quiz hand.
 * Run: npx tsx scripts/fetch-tile-assets.ts
 *
 * Source: github.com/FluffyStuff/riichi-mahjong-tiles, released under CC0 1.0
 * (public domain) — no attribution required, safe to commit.
 *
 * Upstream ships the tile *body* (`Front.png`) separately from each glyph, so
 * every face is composited onto the front here rather than at render time. The
 * output is one finished tile per file, named in our own notation, downscaled
 * from 600x800 to something sensible for a Discord attachment.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE = "https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Export/Regular";
const OUT = path.join(process.cwd(), "src", "assets", "tiles");

export const TILE_WIDTH = 120;
export const TILE_HEIGHT = 160;

/** Our notation -> upstream filename. */
const SOURCES: Record<string, string> = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`${n}m`, `Man${n}`])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`${n}p`, `Pin${n}`])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`${n}s`, `Sou${n}`])),
  "1z": "Ton",    // East
  "2z": "Nan",    // South
  "3z": "Shaa",   // West
  "4z": "Pei",    // North
  "5z": "Haku",   // white dragon
  "6z": "Hatsu",  // green dragon
  "7z": "Chun",   // red dragon
  // Red fives, unused today but the generator could enable aka dora later.
  "0m": "Man5-Dora",
  "0p": "Pin5-Dora",
  "0s": "Sou5-Dora",
};

async function download(name: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/${name}.png`);
  if (!res.ok) throw new Error(`${name}.png -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const front = await download("Front");
  const back = await download("Back");

  // The face-down tile needs no glyph; it is the whole image.
  await sharp(back)
    .resize(TILE_WIDTH, TILE_HEIGHT, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "back.png"));

  let bytes = 0;
  for (const [tile, source] of Object.entries(SOURCES)) {
    const glyph = await download(source);

    // Two passes on purpose: sharp applies resize before composite whatever the
    // chain order, so combining them would paste a full-size glyph onto an
    // already-shrunk front and fail. Compose at source size, then scale.
    const full = await sharp(front).composite([{ input: glyph }]).png().toBuffer();
    const composed = await sharp(full)
      .resize(TILE_WIDTH, TILE_HEIGHT, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await fs.writeFile(path.join(OUT, `${tile}.png`), composed);
    bytes += composed.length;
    process.stdout.write(`${tile} `);
  }

  console.log(
    `\n\n${Object.keys(SOURCES).length + 1} tiles written to src/assets/tiles ` +
      `at ${TILE_WIDTH}x${TILE_HEIGHT} (${Math.round(bytes / 1024)} KB)`
  );
}

void main();
