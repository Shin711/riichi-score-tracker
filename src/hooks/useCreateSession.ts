"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { storeEditKey } from "@/lib/editKey";
import { storeRecentSession } from "@/lib/recentSession";
import { getSupabaseClient } from "@/lib/supabase/client";

export function useCreateSession() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const token = sessionData.session?.access_token;
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/sessions", { method: "POST", headers, body: "{}" });
      const json = (await res.json()) as {
        session?: { share_id: string; title?: string | null };
        editKey?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to create session");

      const shareId = json.session?.share_id;
      const editKey = json.editKey;
      if (!shareId || !editKey) throw new Error("Invalid server response");

      const title = json.session?.title ?? "Riichi session";
      storeEditKey(shareId, editKey);
      storeRecentSession(shareId, title);
      router.push(`/s/${shareId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }, [router]);

  return { createSession, loading, error, clearError: () => setError(null) };
}
