import { randomUUID } from "node:crypto";

import WebSocket from "ws";

import { liqiType, type MajsoulRecordGame } from "@/lib/majsoul/proto";

const MSG_TYPE_NOTIFY = 1;
const MSG_TYPE_REQUEST = 2;
const MSG_TYPE_RESPONSE = 3;
const MAX_MSG_INDEX = 2 ** 16;

const EN_GATEWAY = "wss://engs.mahjongsoul.com:443/gateway";
const DEFAULT_CLIENT_VERSION = "0.16.213";
const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 15_000;

/** Codes worth translating; anything else surfaces its numeric code. */
const ERROR_MESSAGES: Record<number, string> = {
  // The usual failure once the stored token rotates.
  109: "The Mahjong Soul import token has expired — refresh MAJSOUL_TOKEN.",
  110: "Mahjong Soul rejected the import credentials — check MAJSOUL_UID and MAJSOUL_TOKEN.",
  503: "The Mahjong Soul account used for imports is banned.",
  1002: "The Mahjong Soul import account is not signed up.",
  1004: "The Mahjong Soul import account is not logged in.",
  1005: "The Mahjong Soul import account is already logged in elsewhere.",
  1006: "The Mahjong Soul import account does not exist.",
  1203: "No Mahjong Soul game found with that ID.",
};

export class MajsoulError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
    this.name = "MajsoulError";
  }
}

export class MajsoulNotConfiguredError extends Error {
  constructor() {
    super("Mahjong Soul lookup is not configured on this server.");
    this.name = "MajsoulNotConfiguredError";
  }
}

type PendingCall = {
  resolve: (data: Uint8Array) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

type MajsoulCredentials = {
  uid: string;
  token: string;
  clientVersion: string;
};

export function getMajsoulCredentials(): MajsoulCredentials | null {
  const uid = process.env.MAJSOUL_UID?.trim();
  const token = process.env.MAJSOUL_TOKEN?.trim();
  if (!uid || !token) return null;
  return {
    uid,
    token,
    clientVersion: process.env.MAJSOUL_CLIENT_VERSION?.trim() || DEFAULT_CLIENT_VERSION,
  };
}

export function isMajsoulLookupConfigured(): boolean {
  return getMajsoulCredentials() !== null;
}

/**
 * Short-lived Mahjong Soul websocket session.
 *
 * Majsoul frames every request as:
 *   [0x02][index:u16le][Wrapper{ name, data }]
 * and replies with the same index under message type 0x03. Notifications
 * (0x01) carry no index and are ignored here.
 */
class MajsoulSession {
  private ws: WebSocket | null = null;
  private index = 0;
  private readonly pending = new Map<number, PendingCall>();
  private readonly clientVersionString: string;

  constructor(private readonly credentials: MajsoulCredentials) {
    this.clientVersionString = `WebGL_2022-${credentials.clientVersion}`;
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(EN_GATEWAY, { handshakeTimeout: CONNECT_TIMEOUT_MS });
      this.ws = ws;

      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error("Timed out connecting to Mahjong Soul."));
      }, CONNECT_TIMEOUT_MS);

      ws.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
      ws.on("message", (data) => this.onMessage(data as Buffer));
      ws.on("close", () => this.failAllPending(new Error("Mahjong Soul closed the connection.")));
    });
  }

  private onMessage(raw: Buffer) {
    if (raw.length < 1) return;
    const msgType = raw[0];
    if (msgType === MSG_TYPE_NOTIFY) return; // push notifications are irrelevant here
    if (msgType !== MSG_TYPE_RESPONSE || raw.length < 3) return;

    const msgIndex = raw.readUInt16LE(1);
    const pending = this.pending.get(msgIndex);
    if (!pending) return;
    this.pending.delete(msgIndex);
    clearTimeout(pending.timer);

    try {
      const wrapper = liqiType("Wrapper").decode(raw.subarray(3)) as unknown as {
        data: Uint8Array;
      };
      pending.resolve(wrapper.data);
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private failAllPending(err: Error) {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  /**
   * Issue one request/response round trip.
   *
   * `service` matters: connection setup lives on `lq.Route`, everything else on
   * `lq.Lobby`.
   */
  private async call<T>(
    service: "Lobby" | "Route",
    method: string,
    reqType: string,
    resType: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Mahjong Soul connection is not open.");
    }

    const msgIndex = this.index;
    this.index = (this.index + 1) % MAX_MSG_INDEX;

    const request = liqiType(reqType);
    const reqErr = request.verify(payload);
    if (reqErr) throw new Error(`Invalid ${reqType}: ${reqErr}`);
    const body = request.encode(request.create(payload)).finish();

    const wrapperType = liqiType("Wrapper");
    const wrapped = wrapperType
      .encode(wrapperType.create({ name: `.lq.${service}.${method}`, data: body }))
      .finish();

    const header = Buffer.alloc(3);
    header.writeUInt8(MSG_TYPE_REQUEST, 0);
    header.writeUInt16LE(msgIndex, 1);

    const responseData = await new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msgIndex);
        reject(new Error(`Mahjong Soul did not respond to ${method} in time.`));
      }, CALL_TIMEOUT_MS);

      this.pending.set(msgIndex, { resolve, reject, timer });
      ws.send(Buffer.concat([header, Buffer.from(wrapped)]), (err) => {
        if (!err) return;
        this.pending.delete(msgIndex);
        clearTimeout(timer);
        reject(err);
      });
    });

    const decoded = liqiType(resType).decode(responseData) as unknown as {
      error?: { code?: number };
    } & T;

    const code = decoded.error?.code ?? 0;
    if (code) {
      throw new MajsoulError(
        code,
        ERROR_MESSAGES[code] ?? `Mahjong Soul returned error code ${code}.`
      );
    }

    return decoded;
  }

  /**
   * Yo-star (EN) login handshake, mirroring Longhorn-Riichi/InjusticeJudge.
   *
   * `type: 22` means "Yostar session token": since Mahjong Soul moved the
   * English server onto unified Yostar accounts (March 2026), the session token
   * captured from `en-sdk-api.yostarplat.com/user/quick-login` is passed
   * straight to oauth2Auth. There is no password login on this server — Yostar
   * sign-in is email plus an emailed code — so the token must be captured once
   * from a browser and supplied via env.
   */
  async login(): Promise<void> {
    await this.call("Route", "requestConnection", "ReqRequestConnection", "ResRequestConnection", {
      type: 1,
      route_id: "en-2",
      timestamp: Math.floor(Date.now() / 1000),
      platform: "Web",
    });
    await this.call("Route", "heartbeat", "ReqHeartbeat", "ResHeartbeat", {});

    const auth = await this.call<{ access_token: string }>(
      "Lobby",
      "oauth2Auth",
      "ReqOauth2Auth",
      "ResOauth2Auth",
      {
        type: 22,
        code: this.credentials.token,
        uid: this.credentials.uid,
        client_version_string: this.clientVersionString,
      }
    );

    await this.call("Route", "heartbeat", "ReqHeartbeat", "ResHeartbeat", {});

    const check = await this.call<{ has_account: boolean }>(
      "Lobby",
      "oauth2Check",
      "ReqOauth2Check",
      "ResOauth2Check",
      { type: 22, access_token: auth.access_token }
    );
    if (!check.has_account) {
      throw new Error(
        "Mahjong Soul rejected the import account — MAJSOUL_UID/MAJSOUL_TOKEN may have expired."
      );
    }

    await this.call("Lobby", "oauth2Login", "ReqOauth2Login", "ResLogin", {
      type: 22,
      access_token: auth.access_token,
      reconnect: false,
      device: {
        platform: "pc",
        hardware: "pc",
        os: "windows",
        is_browser: true,
        software: "Firefox",
        sale_platform: "web",
      },
      random_key: randomUUID(),
      client_version: { resource: `${this.credentials.clientVersion}.w` },
      currency_platforms: [],
      client_version_string: this.clientVersionString,
      tag: "en",
    });
  }

  async fetchGameRecord(gameUuid: string): Promise<MajsoulRecordGame> {
    const res = await this.call<{ head?: MajsoulRecordGame }>(
      "Lobby",
      "fetchGameRecord",
      "ReqGameRecord",
      "ResGameRecord",
      { game_uuid: gameUuid, client_version_string: this.clientVersionString }
    );
    if (!res.head) {
      throw new MajsoulError(1203, ERROR_MESSAGES[1203]);
    }
    return res.head;
  }

  close(): void {
    this.failAllPending(new Error("Mahjong Soul session closed."));
    try {
      this.ws?.close();
    } catch {
      // best effort — the socket is being discarded either way
    }
    this.ws = null;
  }
}

/**
 * Log in, fetch one game's summary record, and disconnect.
 *
 * Serverless invocations are ephemeral, so every lookup pays a fresh login
 * (~3-6s). Only the `head` summary is fetched — we never download the full
 * replay payload, which is far larger and unnecessary for scores.
 */
export async function fetchMajsoulGameRecord(gameUuid: string): Promise<MajsoulRecordGame> {
  const credentials = getMajsoulCredentials();
  if (!credentials) throw new MajsoulNotConfiguredError();

  const session = new MajsoulSession(credentials);
  try {
    await session.connect();
    await session.login();
    return await session.fetchGameRecord(gameUuid);
  } finally {
    session.close();
  }
}
