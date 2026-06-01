import type { User } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/server";

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getAdminUserIds(): Set<string> {
  return new Set(parseCsvEnv("ADMIN_USER_IDS"));
}

export function getAdminEmails(): Set<string> {
  return new Set(parseCsvEnv("ADMIN_EMAILS").map((e) => e.toLowerCase()));
}

export function isAdminConfigured(): boolean {
  return getAdminUserIds().size > 0 || getAdminEmails().size > 0;
}

export function isAdminUser(user: Pick<User, "id" | "email">): boolean {
  if (!isAdminConfigured()) return false;
  if (getAdminUserIds().has(user.id)) return true;
  const email = user.email?.trim().toLowerCase();
  return !!email && getAdminEmails().has(email);
}

export type AdminAuthResult =
  | { ok: true; user: User; supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> }
  | { ok: false; error: string; status: number };

/** Validate Bearer token and ensure the caller is an admin (ADMIN_USER_IDS / ADMIN_EMAILS). */
export async function requireAdminFromRequest(req: Request): Promise<AdminAuthResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured.", status: 500 };
  }
  if (!isAdminConfigured()) {
    return { ok: false, error: "Admin access is not configured.", status: 503 };
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) {
    return { ok: false, error: "Sign in required.", status: 401 };
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return { ok: false, error: userErr?.message ?? "Invalid token.", status: 401 };
  }
  if (!isAdminUser(userData.user)) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  return { ok: true, user: userData.user, supabase };
}
