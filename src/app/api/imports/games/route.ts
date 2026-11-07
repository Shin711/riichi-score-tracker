import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/api/bearerAuth";
import { postGameLogAfterResponse } from "@/lib/discord/postGameLog";
import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { ImportBodyError, parseImportBody, type ImportBody } from "@/lib/imports/parseImportBody";
import type { ImportedGameRow } from "@/lib/imports/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const IMPORTED_GAME_COLUMNS =
  "id, played_at, starting_points, entries_json, mjs_paipu_url, mjs_record_uuid, created_at, imported_by_user_id";

const DEFAULT_IMPORT_PAGE_SIZE = 10;
const MAX_IMPORT_PAGE_SIZE = 50;

function parseImportListParams(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = Number.parseInt(
    url.searchParams.get("pageSize") ?? String(DEFAULT_IMPORT_PAGE_SIZE),
    10
  );
  const pageSize = Math.min(
    MAX_IMPORT_PAGE_SIZE,
    Math.max(1, requestedPageSize || DEFAULT_IMPORT_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { page, pageSize, from, to } = parseImportListParams(new URL(req.url));

  const { data, error, count } = await supabase
    .from("imported_games")
    .select(IMPORTED_GAME_COLUMNS, {
      count: "exact",
    })
    .order("played_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return NextResponse.json({
    imports: (data ?? []) as ImportedGameRow[],
    page,
    pageSize,
    total,
    totalPages,
  });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as ImportBody;

  try {
    const game = await parseImportBody(supabase, body);
    const importedByUserId = await getUserIdFromRequest(req, supabase);

    const { data, error } = await supabase
      .from("imported_games")
      .insert({ ...game, imported_by_user_id: importedByUserId })
      .select(IMPORTED_GAME_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    refreshDiscordLeaderboardAfterResponse();
    postGameLogAfterResponse(data as ImportedGameRow);

    return NextResponse.json({ import: data as ImportedGameRow });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to import game" },
      { status: e instanceof ImportBodyError ? e.status : 400 }
    );
  }
}
