import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendMajsoulLookup,
  MJS_LOOKUP_LOG_LIMIT,
  type MajsoulLookupLogEntry,
} from "@/lib/majsoul/lookupLog";

function entry(n: number): MajsoulLookupLogEntry {
  return {
    at: new Date(Date.UTC(2026, 10, 13, 0, n)).toISOString(),
    ok: n % 2 === 0,
    code: n % 2 === 0 ? null : 540,
    error: n % 2 === 0 ? null : "throttled",
    failedAt: n % 2 === 0 ? null : "fetchGameRecord",
    durationMs: 3000,
    calls: { oauth2Login: 1, fetchGameRecord: 1 },
    clientVersion: { string: "WebGL_2022-4.0.13", resource: "0.11.252.w", package: "4.0.13" },
    rejectedVersions: [],
    versionOverride: null,
    recordUuid: `game-${n}`,
    purpose: "preview",
  };
}

describe("majsoul lookup log", () => {
  it("puts the newest lookup first", () => {
    const list = appendMajsoulLookup([entry(1)], entry(2));
    assert.deepEqual(
      list.map((e) => e.recordUuid),
      ["game-2", "game-1"]
    );
  });

  it(`keeps only the newest ${MJS_LOOKUP_LOG_LIMIT}`, () => {
    let list: MajsoulLookupLogEntry[] = [];
    for (let n = 1; n <= MJS_LOOKUP_LOG_LIMIT + 5; n++) list = appendMajsoulLookup(list, entry(n));
    assert.equal(list.length, MJS_LOOKUP_LOG_LIMIT);
    assert.equal(list[0].recordUuid, `game-${MJS_LOOKUP_LOG_LIMIT + 5}`);
    assert.equal(list.at(-1)!.recordUuid, "game-6");
  });

  it("starts fresh when the stored value isn't a list", () => {
    for (const junk of [undefined, null, {}, "x"]) {
      assert.deepEqual(appendMajsoulLookup(junk, entry(1)), [entry(1)]);
    }
  });
});
