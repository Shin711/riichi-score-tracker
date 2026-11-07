import type { SupabaseClient } from "@supabase/supabase-js";

import { getApprovalChannelId, getBotToken, postChannelMessage } from "@/lib/discord/bot";
import {
  buildChangeRequestMessage,
  changeRequestOutcomeLine,
  sameGameSnapshot,
  snapshotOf,
  type ChangeRequestDecision,
  type ChangeRequestKind,
  type GameSnapshot,
} from "@/lib/discord/changeRequestMessage";
import { postGameLogAfterResponse } from "@/lib/discord/postGameLog";
import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { ImportBodyError, parseImportBody, type ImportBody } from "@/lib/imports/parseImportBody";
import type { ImportedGameRow } from "@/lib/imports/types";

const TABLE = "game_change_requests";

export const IMPORTED_GAME_COLUMNS =
  "id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at, imported_by_user_id";

export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "stale";

type ChangeRequestRow = {
  id: string;
  game_id: string | null;
  kind: ChangeRequestKind;
  status: ChangeRequestStatus;
  before_json: GameSnapshot;
  proposed_json: ImportBody | null;
};

/** Edits and removals need a bot token and an approval channel to be posted for review. */
export function isChangeApprovalConfigured(): boolean {
  return getBotToken() !== null && getApprovalChannelId() !== null;
}

/** Applies an edit straight away (admins, and approved requests). */
export async function applyGameEdit(
  supabase: SupabaseClient,
  gameId: string,
  body: ImportBody
): Promise<ImportedGameRow> {
  const game = await parseImportBody(supabase, body, gameId);
  const { data, error } = await supabase
    .from("imported_games")
    .update(game)
    .eq("id", gameId)
    .select(IMPORTED_GAME_COLUMNS)
    .single();
  if (error) throw new ImportBodyError(error.message);

  refreshDiscordLeaderboardAfterResponse();
  postGameLogAfterResponse(data as ImportedGameRow, null, { edited: true });
  return data as ImportedGameRow;
}

/** Removes a game straight away (admins, and approved requests). */
export async function applyGameDelete(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { error } = await supabase.from("imported_games").delete().eq("id", gameId);
  if (error) throw new ImportBodyError(error.message);
  refreshDiscordLeaderboardAfterResponse();
}

/**
 * Records a pending edit or removal and posts it to the approval channel.
 * Nothing about the game changes until someone in that channel approves it.
 */
export async function requestGameChange(
  supabase: SupabaseClient,
  input: {
    game: ImportedGameRow;
    kind: ChangeRequestKind;
    body?: ImportBody;
    requestedByUserId: string | null;
    requestedByLabel: string | null;
    requestedIp: string;
  }
): Promise<{ id: string }> {
  const channelId = getApprovalChannelId();
  if (!channelId || !getBotToken()) {
    throw new ImportBodyError(
      "Edits and removals need approval, but the Discord approval channel isn't set up yet.",
      503
    );
  }

  const before = snapshotOf(input.game);
  let after: GameSnapshot | null = null;
  let proposed: ImportBody | null = null;

  if (input.kind === "edit") {
    const body = input.body ?? {};
    // Validate now, but don't create any new players until the edit is approved.
    const parsed = await parseImportBody(supabase, body, input.game.id, { dryRun: true });
    after = snapshotOf(parsed);
    if (sameGameSnapshot(before, after)) {
      throw new ImportBodyError("Nothing changed — the game already looks like this.");
    }
    proposed = {
      playedAt: body.playedAt,
      startingPoints: body.startingPoints,
      mjsPaipuUrl: body.mjsPaipuUrl,
      seats: body.seats,
    };
  }

  const { data: created, error } = await supabase
    .from(TABLE)
    .insert({
      game_id: input.game.id,
      kind: input.kind,
      before_json: before,
      proposed_json: proposed,
      requested_by_user_id: input.requestedByUserId,
      requested_ip: input.requestedIp,
      discord_channel_id: channelId,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ImportBodyError(
        "A change to this game is already waiting for approval in Discord.",
        409
      );
    }
    throw new ImportBodyError(error.message);
  }

  try {
    const posted = await postChannelMessage(
      channelId,
      buildChangeRequestMessage({
        requestId: created.id,
        kind: input.kind,
        before,
        after,
        requestedBy: input.requestedByLabel,
      })
    );
    await supabase.from(TABLE).update({ discord_message_id: posted.id }).eq("id", created.id);
  } catch (e) {
    // No post means nobody can approve it, so don't leave it blocking the game.
    await supabase.from(TABLE).delete().eq("id", created.id);
    console.error("[approvals] failed to post change request:", e);
    throw new ImportBodyError("Couldn't send the request to Discord for approval. Try again.", 502);
  }

  return { id: created.id };
}

/** Game ids on this page that have a change waiting for approval. */
export async function pendingChangesForGames(
  supabase: SupabaseClient,
  gameIds: string[]
): Promise<Record<string, ChangeRequestKind>> {
  if (gameIds.length === 0) return {};
  const { data, error } = await supabase
    .from(TABLE)
    .select("game_id, kind")
    .eq("status", "pending")
    .in("game_id", gameIds);
  // Before migration 012 the table doesn't exist; show no pending changes rather than failing.
  if (error) return {};
  return Object.fromEntries(
    (data ?? []).flatMap((row) => (row.game_id ? [[row.game_id, row.kind as ChangeRequestKind]] : []))
  );
}

export type DecisionResult =
  | { ok: true; status: "approved" | "rejected" | "stale"; kind: ChangeRequestKind; line: string }
  | { ok: false; message: string };

/**
 * Settles a request from an Approve / Reject click. Claims the row first
 * (pending → decided) so two people clicking at once can't apply it twice.
 */
export async function decideGameChange(
  supabase: SupabaseClient,
  requestId: string,
  decision: ChangeRequestDecision,
  decider: { id: string; username: string }
): Promise<DecisionResult> {
  const { data: request, error: loadErr } = await supabase
    .from(TABLE)
    .select("id, game_id, kind, status, before_json, proposed_json")
    .eq("id", requestId)
    .maybeSingle<ChangeRequestRow>();
  if (loadErr) return { ok: false, message: loadErr.message };
  if (!request) return { ok: false, message: "That request no longer exists." };

  if (request.status !== "pending") {
    return {
      ok: true,
      status: request.status,
      kind: request.kind,
      line: changeRequestOutcomeLine(request.status, request.kind, null),
    };
  }

  const settle = async (status: "approved" | "rejected" | "stale") => {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status,
        decided_by_discord_id: decider.id,
        decided_by_discord_name: decider.username,
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  };
  const reopen = () =>
    supabase
      .from(TABLE)
      .update({
        status: "pending",
        decided_by_discord_id: null,
        decided_by_discord_name: null,
        decided_at: null,
      })
      .eq("id", requestId);

  const outcome = (status: "approved" | "rejected" | "stale"): DecisionResult => ({
    ok: true,
    status,
    kind: request.kind,
    line: changeRequestOutcomeLine(status, request.kind, status === "stale" ? null : decider.id),
  });

  if (decision === "reject") {
    if (!(await settle("rejected"))) return { ok: false, message: "Someone else already settled this request." };
    return outcome("rejected");
  }

  const { data: game } = request.game_id
    ? await supabase
        .from("imported_games")
        .select(IMPORTED_GAME_COLUMNS)
        .eq("id", request.game_id)
        .maybeSingle<ImportedGameRow>()
    : { data: null };

  if (!game || !sameGameSnapshot(request.before_json, snapshotOf(game))) {
    await settle("stale");
    return outcome("stale");
  }

  if (!(await settle("approved"))) return { ok: false, message: "Someone else already settled this request." };

  try {
    if (request.kind === "delete") {
      await applyGameDelete(supabase, game.id);
    } else {
      await applyGameEdit(supabase, game.id, request.proposed_json ?? {});
    }
  } catch (e) {
    await reopen();
    return {
      ok: false,
      message: `Couldn't apply it: ${e instanceof Error ? e.message : "unknown error"}. The request is still open.`,
    };
  }

  return outcome("approved");
}
