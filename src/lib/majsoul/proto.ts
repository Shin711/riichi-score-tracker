import protobuf from "protobufjs";

/**
 * Minimal subset of Mahjong Soul's `liqi.proto`, hand-transcribed from the
 * upstream definitions (field numbers must match exactly — names are ours).
 *
 * We deliberately do not vendor the full ~8k-line protocol: we only need the
 * login handshake plus `fetchGameRecord`. Protobuf ignores unknown fields on
 * decode, so partial messages (e.g. GameDetailRule) decode fine.
 *
 * Upstream reference: https://github.com/Longhorn-Riichi/Ronhorn
 *   modules/pymjsoul/proto/liqi_combined.proto
 */
const LIQI_DESCRIPTOR = {
  nested: {
    lq: {
      nested: {
        Error: {
          fields: {
            code: { type: "uint32", id: 1 },
            u32_params: { rule: "repeated", type: "uint32", id: 2 },
            str_params: { rule: "repeated", type: "string", id: 3 },
            json_param: { type: "string", id: 4 },
          },
        },

        /** Envelope wrapping every request/response payload. */
        Wrapper: {
          fields: {
            name: { type: "string", id: 1 },
            data: { type: "bytes", id: 2 },
          },
        },

        ResCommon: {
          fields: { error: { type: "Error", id: 1 } },
        },

        // ---- Route service (connection setup) ----

        ReqRequestConnection: {
          fields: {
            type: { type: "uint32", id: 2 },
            route_id: { type: "string", id: 3 },
            timestamp: { type: "uint64", id: 4 },
            platform: { type: "string", id: 6 },
          },
        },
        ResRequestConnection: {
          fields: {
            error: { type: "Error", id: 1 },
            timestamp: { type: "uint64", id: 2 },
            result: { type: "uint32", id: 3 },
          },
        },
        ReqHeartbeat: {
          fields: {
            delay: { type: "uint32", id: 1 },
            no_operation_counter: { type: "uint32", id: 2 },
            platform: { type: "uint32", id: 3 },
            network_quality: { type: "uint32", id: 4 },
          },
        },
        ResHeartbeat: {
          fields: { error: { type: "Error", id: 1 } },
        },

        // ---- Lobby service (auth) ----

        ClientDeviceInfo: {
          fields: {
            platform: { type: "string", id: 1 },
            hardware: { type: "string", id: 2 },
            os: { type: "string", id: 3 },
            os_version: { type: "string", id: 4 },
            is_browser: { type: "bool", id: 5 },
            software: { type: "string", id: 6 },
            sale_platform: { type: "string", id: 7 },
          },
        },
        ClientVersionInfo: {
          fields: {
            resource: { type: "string", id: 1 },
            package: { type: "string", id: 2 },
          },
        },
        ReqOauth2Auth: {
          fields: {
            type: { type: "uint32", id: 1 },
            code: { type: "string", id: 2 },
            uid: { type: "string", id: 3 },
            client_version_string: { type: "string", id: 4 },
          },
        },
        ResOauth2Auth: {
          fields: {
            error: { type: "Error", id: 1 },
            access_token: { type: "string", id: 2 },
          },
        },
        ReqOauth2Check: {
          fields: {
            type: { type: "uint32", id: 1 },
            access_token: { type: "string", id: 2 },
          },
        },
        ResOauth2Check: {
          fields: {
            error: { type: "Error", id: 1 },
            has_account: { type: "bool", id: 2 },
          },
        },
        ReqOauth2Login: {
          fields: {
            type: { type: "uint32", id: 1 },
            access_token: { type: "string", id: 2 },
            reconnect: { type: "bool", id: 3 },
            device: { type: "ClientDeviceInfo", id: 4 },
            random_key: { type: "string", id: 5 },
            client_version: { type: "ClientVersionInfo", id: 6 },
            gen_access_token: { type: "bool", id: 7 },
            currency_platforms: { rule: "repeated", type: "uint32", id: 8 },
            version: { type: "uint32", id: 9 },
            client_version_string: { type: "string", id: 10 },
            tag: { type: "string", id: 11 },
          },
        },
        /** Partial — we only read `error` and `account_id`. */
        ResLogin: {
          fields: {
            error: { type: "Error", id: 1 },
            account_id: { type: "uint32", id: 2 },
          },
        },

        // ---- Lobby service (game records) ----

        /** Partial — `init_point` is the starting stack. */
        GameDetailRule: {
          fields: {
            dora_count: { type: "uint32", id: 3 },
            shiduan: { type: "uint32", id: 4 },
            init_point: { type: "uint32", id: 5 },
            fandian: { type: "uint32", id: 6 },
          },
        },
        GameMode: {
          fields: {
            mode: { type: "uint32", id: 1 },
            ai: { type: "bool", id: 4 },
            extendinfo: { type: "string", id: 5 },
            detail_rule: { type: "GameDetailRule", id: 6 },
          },
        },
        GameMetaData: {
          fields: {
            room_id: { type: "uint32", id: 1 },
            mode_id: { type: "uint32", id: 2 },
            contest_uid: { type: "uint32", id: 3 },
          },
        },
        GameConfig: {
          fields: {
            category: { type: "uint32", id: 1 },
            mode: { type: "GameMode", id: 2 },
            meta: { type: "GameMetaData", id: 3 },
          },
        },
        GameEndResult: {
          fields: {
            players: { rule: "repeated", type: "PlayerItem", id: 1 },
          },
          nested: {
            PlayerItem: {
              fields: {
                seat: { type: "uint32", id: 1 },
                total_point: { type: "int32", id: 2 },
                /** Final table score (e.g. 32100). */
                part_point_1: { type: "int32", id: 3 },
                part_point_2: { type: "int32", id: 4 },
                grading_score: { type: "int32", id: 5 },
                gold: { type: "int32", id: 6 },
              },
            },
          },
        },
        RecordGame: {
          fields: {
            uuid: { type: "string", id: 1 },
            start_time: { type: "uint32", id: 2 },
            end_time: { type: "uint32", id: 3 },
            config: { type: "GameConfig", id: 5 },
            /** Human seats only — AI seats are absent. */
            accounts: { rule: "repeated", type: "AccountInfo", id: 11 },
            result: { type: "GameEndResult", id: 12 },
            standard_rule: { type: "uint32", id: 14 },
          },
          nested: {
            AccountInfo: {
              fields: {
                account_id: { type: "uint32", id: 1 },
                seat: { type: "uint32", id: 2 },
                nickname: { type: "string", id: 3 },
                avatar_id: { type: "uint32", id: 4 },
              },
            },
          },
        },
        ReqGameRecord: {
          fields: {
            game_uuid: { type: "string", id: 1 },
            client_version_string: { type: "string", id: 2 },
          },
        },
        ResGameRecord: {
          fields: {
            error: { type: "Error", id: 1 },
            head: { type: "RecordGame", id: 3 },
            data: { type: "bytes", id: 4 },
            data_url: { type: "string", id: 5 },
          },
        },
      },
    },
  },
} as const;

let cachedRoot: protobuf.Root | null = null;

/** Lazily built protobuf root for the `lq` package. */
export function liqiRoot(): protobuf.Root {
  if (!cachedRoot) {
    cachedRoot = protobuf.Root.fromJSON(LIQI_DESCRIPTOR as unknown as protobuf.INamespace);
  }
  return cachedRoot;
}

export function liqiType(name: string): protobuf.Type {
  return liqiRoot().lookupType(`lq.${name}`);
}

// ---- Decoded shapes we actually consume ----

export type MajsoulAccountInfo = {
  account_id: number;
  seat: number;
  nickname: string;
};

export type MajsoulPlayerItem = {
  seat: number;
  total_point: number;
  part_point_1: number;
};

export type MajsoulRecordGame = {
  uuid: string;
  start_time: number;
  end_time: number;
  config?: {
    category?: number;
    mode?: {
      mode?: number;
      detail_rule?: { init_point?: number };
    };
    meta?: { contest_uid?: number; room_id?: number; mode_id?: number };
  };
  accounts?: MajsoulAccountInfo[];
  result?: { players?: MajsoulPlayerItem[] };
};
