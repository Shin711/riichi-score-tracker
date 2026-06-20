import type { SupabaseClient } from "@supabase/supabase-js";

export async function getUserIdFromRequest(
  req: Request,
  supabase: SupabaseClient
): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return null;

  const { data: userData } = await supabase.auth.getUser(token);
  return userData.user?.id ?? null;
}
