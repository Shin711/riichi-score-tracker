"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { storeEditKey } from "@/lib/editKey";
import { getSupabaseClient } from "@/lib/supabase/client";

export function CreateSessionCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
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

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers,
        body: "{}",
      });
      const json = (await res.json()) as { session?: { share_id: string }; editKey?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to create session");
      const shareId = json.session?.share_id;
      const editKey = json.editKey;
      if (!shareId || !editKey) throw new Error("Invalid server response");
      storeEditKey(shareId, editKey);
      router.push(`/s/${shareId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight">New session</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Create a shareable session link. Anyone with the link can view; editing is enabled on devices that
        have the edit key.
      </p>
      <div className="mt-5">
        <button
          onClick={() => void onCreate()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {loading ? "Creating…" : "Create session"}
        </button>
      </div>
      {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
