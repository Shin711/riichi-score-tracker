import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/api/adminAuth";
import {
  applyGameDelete,
  applyGameEdit,
  IMPORTED_GAME_COLUMNS,
  isChangeApprovalConfigured,
  requestGameChange,
} from "@/lib/imports/changeRequests";
import { ImportBodyError, type ImportBody } from "@/lib/imports/parseImportBody";
import type { ImportedGameRow } from "@/lib/imports/types";
import { checkGameChangeRequestRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/requestIp";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

async function requestUser(req: Request, supabase: SupabaseClient): Promise<User | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data.user ?? null;
}

async function loadGame(supabase: SupabaseClient, id: string): Promise<ImportedGameRow | null> {
  const { data, error } = await supabase
    .from("imported_games")
    .select(IMPORTED_GAME_COLUMNS)
    .eq("id", id)
    .maybeSingle<ImportedGameRow>();
  if (error) throw new ImportBodyError(error.message);
  return data;
}

function errorResponse(e: unknown, fallback: string) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : fallback },
    { status: e instanceof ImportBodyError ? e.status : 400 }
  );
}

/**
 * Edit or remove a recorded game. Club admins apply it straight away; anyone
 * else's change is posted to the Discord approval channel and only happens
 * once someone there approves it.
 */
async function handleChange(req: Request, ctx: Ctx, kind: "edit" | "delete") {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await ctx.params;
  const body =
    kind === "edit" ? ((await req.json().catch(() => ({}))) as ImportBody) : undefined;

  try {
    const game = await loadGame(supabase, id);
    if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

    const user = await requestUser(req, supabase);
    if (user && isAdminUser(user)) {
      if (kind === "delete") {
        await applyGameDelete(supabase, id);
        return NextResponse.json({ ok: true });
      }
      const updated = await applyGameEdit(supabase, id, body ?? {});
      return NextResponse.json({ import: updated });
    }

    if (!isChangeApprovalConfigured()) {
      return NextResponse.json(
        {
          error:
            "Edits and removals need approval, but the Discord approval channel isn't set up yet.",
        },
        { status: 503 }
      );
    }

    const ip = getClientIp(req);
    if (!(await checkGameChangeRequestRateLimit(supabase, ip))) {
      return NextResponse.json(
        { error: "Too many edit or removal requests. Try again in an hour." },
        { status: 429, headers: { "Retry-After": "3600" } }
      );
    }

    const request = await requestGameChange(supabase, {
      game,
      kind,
      body,
      requestedByUserId: user?.id ?? null,
      requestedByLabel: user?.email ?? null,
      requestedIp: ip,
    });
    return NextResponse.json({ pending: true, requestId: request.id }, { status: 202 });
  } catch (e) {
    return errorResponse(e, kind === "edit" ? "Failed to update game" : "Failed to remove game");
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  return handleChange(req, ctx, "edit");
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleChange(req, ctx, "delete");
}
