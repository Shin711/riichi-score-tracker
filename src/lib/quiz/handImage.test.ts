import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import type { QuizHand } from "@/lib/quiz/hand";
import { renderHandImage } from "@/lib/quiz/handImage";

/**
 * 234m 567m 345p 67p 55s, ron 8p under riichi — as stored before ura dora
 * existed, so with no uraDoraIndicator key at all.
 */
const STORED_HAND: QuizHand = {
  concealed: ["2m", "3m", "4m", "5m", "6m", "7m", "3p", "4p", "5p", "6p", "7p", "5s", "5s"],
  melds: [],
  winningTile: "8p",
  winType: "ron",
  seatWind: "south",
  roundWind: "east",
  doraIndicator: "4s",
  riichi: true,
};

const RIICHI_HAND: QuizHand = { ...STORED_HAND, uraDoraIndicator: "9p" };

async function size(hand: QuizHand): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(await renderHandImage(hand)).metadata();
  return { width: width ?? 0, height: height ?? 0 };
}

describe("renderHandImage — dora wall", () => {
  it("adds the wall's lower row when there is an ura dora indicator", async () => {
    const plain = await size({ ...RIICHI_HAND, riichi: false });
    const riichi = await size(RIICHI_HAND);
    assert.equal(riichi.width, plain.width);
    assert.ok(riichi.height > plain.height, "ura dora row did not make the image taller");
  });

  it("draws a riichi hand stored before ura dora existed as it always was", async () => {
    assert.deepEqual(await size(STORED_HAND), await size({ ...RIICHI_HAND, riichi: false }));
  });
});
