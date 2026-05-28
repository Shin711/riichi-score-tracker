"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CreateSessionButton } from "@/components/CreateSessionButton";
import type { SessionRow } from "@/lib/db/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function MySessionsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [sessions, setSessions] = useState<
    Pick<SessionRow, "id" | "share_id" | "title" | "created_at" | "ended_at">[]
  >([]);
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
        .select("id, share_id, title, created_at, ended_at")
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
        <h1 className="text-2xl font-semibold tracking-tight">My games</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Optional: <Link className="underline" href="/login">sign in</Link> to save claimed games to your
          account. You can still play without an account — tap <span className="font-medium">New game</span>{" "}
          anytime.
        </p>
        <CreateSessionButton label="New game" fullWidth />
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My games</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Games you claimed while signed in. Most players just resume from the home screen.
          </p>
        </div>
        <CreateSessionButton label="New game" />
      </div>

      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      {sessions.length === 0 && signedIn ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No saved games on your account yet.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Start a game, then tap <span className="font-medium">Claim session</span> inside it to save here.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <CreateSessionButton label="Start new game" fullWidth />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/s/${s.share_id}`}
                  className="flex items-center justify-between px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-950/50"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.title ?? "Session"}</span>
                      {s.ended_at ? (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Ended
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
