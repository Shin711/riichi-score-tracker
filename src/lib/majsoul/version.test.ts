import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProductVersion } from "@/lib/majsoul/version";

describe("parseProductVersion", () => {
  it("reads the Unity WebGL loader filename used since the 4.0.x client", () => {
    const html = `
      <script src="howler.min.js"></script>
      <script src="Build/en-WebGL-release-4.0.13(14).loader.js"></script>
    `;
    assert.equal(parseProductVersion(html), "4.0.13");
  });

  it("accepts a loader filename without a parenthetical build number", () => {
    assert.equal(
      parseProductVersion('<script src="Build/en-WebGL-release-4.0.13.loader.js"></script>'),
      "4.0.13"
    );
  });

  it("still reads the older productVersion field when present", () => {
    assert.equal(parseProductVersion('productVersion: "4.0.10"'), "4.0.10");
  });

  it("returns null when neither form is present", () => {
    assert.equal(parseProductVersion("<html><body>MahjongSoul</body></html>"), null);
  });
});
