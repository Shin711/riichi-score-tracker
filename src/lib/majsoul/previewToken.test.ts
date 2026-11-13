import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMajsoulPreviewToken,
  PREVIEW_TOKEN_TTL_MS,
  verifyMajsoulPreviewToken,
} from "@/lib/majsoul/previewToken";
import type { MajsoulGameSummary } from "@/lib/majsoul/record";

process.env.MJS_PREVIEW_SECRET = "test-secret";

const SUMMARY: MajsoulGameSummary = {
  recordUuid: "251101-abc",
  playedAt: new Date("2026-11-01T12:00:00Z"),
  startingPoints: 25000,
  seats: [
    { seat: 0, accountId: 1, nickname: "A", finalScore: 40000, isAi: false },
    { seat: 1, accountId: 2, nickname: "B", finalScore: 30000, isAi: false },
    { seat: 2, accountId: 0, nickname: "", finalScore: 20000, isAi: true },
    { seat: 3, accountId: 4, nickname: "D", finalScore: 10000, isAi: false },
  ],
};

describe("majsoul preview token", () => {
  it("round-trips the summary for the same game", () => {
    const token = createMajsoulPreviewToken("251101-abc", SUMMARY, null)!;
    const verified = verifyMajsoulPreviewToken(token, "251101-abc");
    assert.deepEqual(verified, { summary: SUMMARY, stats: null });
  });

  it("rejects a token whose scores were edited", () => {
    const token = createMajsoulPreviewToken("251101-abc", SUMMARY, null)!;
    const [body, mac] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    payload.seats[3].finalScore = 99000;
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`;
    assert.equal(verifyMajsoulPreviewToken(forged, "251101-abc"), null);
  });

  it("rejects a token for a different game", () => {
    const token = createMajsoulPreviewToken("251101-abc", SUMMARY, null)!;
    assert.equal(verifyMajsoulPreviewToken(token, "251101-other"), null);
  });

  it("rejects an expired token", () => {
    const now = Date.now();
    const token = createMajsoulPreviewToken("251101-abc", SUMMARY, null, now)!;
    assert.equal(
      verifyMajsoulPreviewToken(token, "251101-abc", now + PREVIEW_TOKEN_TTL_MS + 1),
      null
    );
  });

  it("rejects junk", () => {
    assert.equal(verifyMajsoulPreviewToken(undefined, "251101-abc"), null);
    assert.equal(verifyMajsoulPreviewToken("nope", "251101-abc"), null);
    assert.equal(verifyMajsoulPreviewToken("a.b.c", "251101-abc"), null);
  });
});
