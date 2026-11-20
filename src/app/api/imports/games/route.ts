import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/api/bearerAuth";
import { postGameLogAfterResponse } from "@/lib/discord/postGameLog";
import { refreshDiscordLeaderboardAfterResponse } from "@/lib/discord/postLeaderboard";
import { IMPORTED_GAME_COLUMNS, pendingChangesForGames } from "@/lib/imports/changeRequests";
import { ImportBodyError, parseImportBody, type ImportBody } from "@/lib/imports/parseImportBody";
import {
  importMatchesNameQuery,
  normalizeImportNameQuery,
  type ImportedGameRow,
} from "@/lib/imports/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_IMPORT_PAGE_SIZE = 10;
const MAX_IMPORT_PAGE_SIZE = 50;
const NAME_SCAN_CHUNK = 1000;

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

  const url = new URL(req.url);
  const { page, pageSize, from, to } = parseImportListParams(url);
  const query = normalizeImportNameQuery(url.searchParams.get("q") ?? "").slice(0, 100);

  let imports: ImportedGameRow[];
  let total: number;

  if (query) {
    // Names live inside the entries_json array, which PostgREST can't substring-match,
    // so scan the (small) id + entries list, filter here, then load just this page.
    const matches: { id: string }[] = [];
    for (let offset = 0; ; offset += NAME_SCAN_CHUNK) {
      const { data, error } = await supabase
        .from("imported_games")
        .select("id, entries_json")
        .order("played_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + NAME_SCAN_CHUNK - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const rows = (data ?? []) as Pick<ImportedGameRow, "id" | "entries_json">[];
      for (const row of rows) if (importMatchesNameQuery(row, query)) matches.push(row);
      if (rows.length < NAME_SCAN_CHUNK) break;
    }

    total = matches.length;
    const pageIds = matches.slice(from, to + 1).map((row) => row.id);
    if (pageIds.length === 0) {
      imports = [];
    } else {
      const { data, error } = await supabase
        .from("imported_games")
        .select(IMPORTED_GAME_COLUMNS)
        .in("id", pageIds);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      const byId = new Map(((data ?? []) as ImportedGameRow[]).map((row) => [row.id, row]));
      imports = pageIds.flatMap((id) => byId.get(id) ?? []);
    }
  } else {
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
    imports = (data ?? []) as ImportedGameRow[];
    total = count ?? 0;
  }

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const pendingChanges = await pendingChangesForGames(
    supabase,
    imports.map((row) => row.id)
  );

  return NextResponse.json({
    imports,
    pendingChanges,
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
