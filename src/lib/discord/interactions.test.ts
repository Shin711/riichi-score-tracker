/**
 * Signature verification tests.
 *
 * Discord validates an interactions endpoint by sending requests with
 * deliberately bad signatures and checking they are rejected, so "accepts a
 * forged signature" is both a security hole and a setup failure.
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import {
  interactionUser,
  modalValues,
  verifyInteractionSignature,
  type Interaction,
} from "@/lib/discord/interactions";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeKeyPair() {
  const pair = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  return { pair, publicKeyHex: toHex(raw) };
}

async function signedRequest(
  privateKey: CryptoKey,
  timestamp: string,
  body: string
): Promise<Request> {
  const signature = new Uint8Array(
    await webcrypto.subtle.sign(
      "Ed25519",
      privateKey,
      new TextEncoder().encode(timestamp + body)
    )
  );
  return new Request("https://example.test/api/discord/interactions", {
    method: "POST",
    headers: {
      "x-signature-ed25519": toHex(signature),
      "x-signature-timestamp": timestamp,
    },
    body,
  });
}

const originalKey = process.env.DISCORD_PUBLIC_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.DISCORD_PUBLIC_KEY;
  else process.env.DISCORD_PUBLIC_KEY = originalKey;
});

describe("verifyInteractionSignature", () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = "1757000000";

  it("accepts a correctly signed request", async () => {
    const { pair, publicKeyHex } = await makeKeyPair();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const request = await signedRequest(pair.privateKey, timestamp, body);
    assert.equal(await verifyInteractionSignature(request, body), true);
  });

  it("rejects a body that was tampered with after signing", async () => {
    const { pair, publicKeyHex } = await makeKeyPair();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const request = await signedRequest(pair.privateKey, timestamp, body);
    assert.equal(
      await verifyInteractionSignature(request, JSON.stringify({ type: 2 })),
      false
    );
  });

  it("rejects a signature made with a different key", async () => {
    const signer = await makeKeyPair();
    const other = await makeKeyPair();
    process.env.DISCORD_PUBLIC_KEY = other.publicKeyHex;

    const request = await signedRequest(signer.pair.privateKey, timestamp, body);
    assert.equal(await verifyInteractionSignature(request, body), false);
  });

  it("rejects a replay under a different timestamp", async () => {
    const { pair, publicKeyHex } = await makeKeyPair();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const request = await signedRequest(pair.privateKey, timestamp, body);
    // The timestamp is part of the signed payload, so swapping it must fail.
    const replayed = new Request(request.url, {
      method: "POST",
      headers: {
        "x-signature-ed25519": request.headers.get("x-signature-ed25519") ?? "",
        "x-signature-timestamp": "1757009999",
      },
      body,
    });
    assert.equal(await verifyInteractionSignature(replayed, body), false);
  });

  it("rejects a request with no signature headers", async () => {
    const { publicKeyHex } = await makeKeyPair();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const bare = new Request("https://example.test/", { method: "POST", body });
    assert.equal(await verifyInteractionSignature(bare, body), false);
  });

  it("rejects malformed hex instead of throwing", async () => {
    const { publicKeyHex } = await makeKeyPair();
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;

    const bad = new Request("https://example.test/", {
      method: "POST",
      headers: {
        "x-signature-ed25519": "not-hex-at-all",
        "x-signature-timestamp": timestamp,
      },
      body,
    });
    assert.equal(await verifyInteractionSignature(bad, body), false);
  });

  it("rejects everything when no public key is configured", async () => {
    const { pair } = await makeKeyPair();
    delete process.env.DISCORD_PUBLIC_KEY;

    const request = await signedRequest(pair.privateKey, timestamp, body);
    assert.equal(await verifyInteractionSignature(request, body), false);
  });
});

describe("interactionUser", () => {
  it("reads the user from a guild interaction", () => {
    const interaction: Interaction = {
      type: 3,
      member: { user: { id: "1", username: "bush" } },
    };
    assert.deepEqual(interactionUser(interaction), { id: "1", username: "bush" });
  });

  it("reads the user from a direct message interaction", () => {
    const interaction: Interaction = { type: 3, user: { id: "2", username: "waffle" } };
    assert.deepEqual(interactionUser(interaction), { id: "2", username: "waffle" });
  });

  it("returns null when neither is present", () => {
    assert.equal(interactionUser({ type: 3 }), null);
  });
});

describe("modalValues", () => {
  it("flattens the nested component rows", () => {
    const interaction: Interaction = {
      type: 5,
      data: {
        components: [
          { components: [{ custom_id: "han", value: "3" }] },
          { components: [{ custom_id: "fu", value: "30" }] },
          { components: [{ custom_id: "score", value: "3900" }] },
        ],
      },
    };
    assert.deepEqual(modalValues(interaction), { han: "3", fu: "30", score: "3900" });
  });

  it("returns an empty object when there are no components", () => {
    assert.deepEqual(modalValues({ type: 5 }), {});
  });
});
