import type { Rules } from "@/lib/scoring/ledger";

export type PlayerRow = {
  id: string;
  display_name: string;
  owner_user_id: string | null;
  created_at: string;
};

export type SessionRow = {
  id: string;
  share_id: string;
  title: string | null;
  rules_json: Rules;
  edit_key: string;
  owner_user_id: string | null;
  created_at: string;
  ended_at: string | null;
};

export type EventRow = {
  id: string;
  session_id: string;
  type: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};
