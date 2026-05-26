"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { SessionRow } from "@/lib/db/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function MySessionsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [sessions, setSessions] = useState<Pick<SessionRow, "id" | "share_id" | "title" | "created_at">[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      if (!supabase) {
        setError("Supabase is not configured.");
        setSignedIn(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);

      const { data, error } = await supabase
        .from("sessions")
        .select("id, share_id, title, created_at")
        .eq("owner_user_id", userData.user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) setError(error.message);
      else setSessions((data ?? []) as typeof sessions);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (signedIn === false) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">My sessions</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Please <Link className="underline" href="/login">sign in</Link> to see claimed sessions.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My sessions</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Sessions you claimed while signed in.
        </p>
      </div>

      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{s.title ?? "Session"}</div>
                <div className="text-xs text-zinc-500">{new Date(s.created_at).toLocaleString()}</div>
              </div>
              <Link className="text-sm underline" href={`/s/${s.share_id}`}>
                Open
              </Link>
            </li>
          ))}
          {sessions.length === 0 && signedIn ? (
            <li className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-300">
              No claimed sessions yet. Open a session and click “Claim session”.
            </li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}
