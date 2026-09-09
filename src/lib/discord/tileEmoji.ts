/**
 * Renders hands with the club's custom tile emoji.
 *
 * The emoji ids are looked up from the guild at send time rather than hardcoded:
 * re-uploading an emoji changes its id, and a stale id renders as literal
 * `<:3s:123…>` text in the channel. Anything we cannot resolve falls back to
 * standard notation, so a missing emoji degrades to `234m` rather than breaking
 * the message.
 */

import { getGuildEmojis, getChannelGuildId } from "@/lib/discord/bot";
import { formatTiles, sortTiles, type Tile } from "@/lib/quiz/tiles";

/** Tile notation -> `<:name:id>`, or null when emoji are unavailable. */
export type TileEmojiMap = Map<Tile, string> | null;

const TILE_NAME = /^[0-9][mpsz]$/;

let cached: { channelId: string; emoji: TileEmojiMap } | null = null;

/**
 * Builds the tile emoji map for the guild that owns `channelId`.
 *
 * Cached per process. Serverless invocations are short-lived so this usually
 * costs two API calls per post, which is immaterial at twice a day.
 */
export async function loadTileEmoji(channelId: string): Promise<TileEmojiMap> {
  if (cached?.channelId === channelId) return cached.emoji;

  let emoji: TileEmojiMap = null;
  try {
    const guildId = await getChannelGuildId(channelId);
    if (guildId) {
      const found = await getGuildEmojis(guildId);
      const map = new Map<Tile, string>();
      for (const entry of found) {
        // Only names shaped like a tile; the guild also holds unrelated emoji.
        if (TILE_NAME.test(entry.name)) map.set(entry.name, `<:${entry.name}:${entry.id}>`);
      }
      if (map.size > 0) emoji = map;
    }
  } catch (e) {
    // Emoji are a presentation nicety — never fail a post over them.
    console.error("[quiz] could not load tile emoji, falling back to text:", e);
  }

  cached = { channelId, emoji };
  return emoji;
}

/** Test seam: drops the cached lookup. */
export function resetTileEmojiCache(): void {
  cached = null;
}

/**
 * Tiles as emoji, or standard notation when any tile is unmapped.
 *
 * Falls back for the whole group rather than per tile, so a hand never comes out
 * as a confusing mix of emoji and text.
 */
export function renderTiles(tiles: Tile[], emoji: TileEmojiMap): string {
  if (!emoji) return formatTiles(tiles);

  const rendered: string[] = [];
  for (const tile of sortTiles(tiles)) {
    const tag = emoji.get(tile);
    if (!tag) return formatTiles(tiles);
    rendered.push(tag);
  }
  return rendered.join("");
}
