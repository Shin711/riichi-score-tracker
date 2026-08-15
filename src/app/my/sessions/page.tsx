"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ImportedGameSummaryCard } from "@/components/ImportedGameSummaryCard";
import { PageHeader } from "@/components/PageHeader";
import type { ImportedGameRow } from "@/lib/imports/types";
import type { SessionRow } from "@/lib/db/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function MySessionsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [imports, setImports] = useState<ImportedGameRow[]>([]);
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

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);

      const token = sessionData.session?.access_token;
      const importHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      const [importsRes, sessionsRes] = await Promise.all([
        fetch("/api/imports/games/mine", { headers: importHeaders }),
        supabase
          .from("sessions")
          .select("id, share_id, title, created_at, ended_at")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (importsRes.ok) {
        const json = (await importsRes.json()) as { imports?: ImportedGameRow[] };
        setImports(json.imports ?? []);
      } else if (importsRes.status !== 401) {
        const json = (await importsRes.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Failed to load imported games.");
      }

      if (sessionsRes.error) setError(sessionsRes.error.message);
      else setSessions((sessionsRes.data ?? []) as typeof sessions);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (signedIn === false) {
    return (
      <main className="space-y-6">
        <PageHeader
          title="My games"
          description="Sign in to see imported matches linked to your account. Import works without an account — signing in saves your history here."
        />
        <div className="card p-6">
          <p className="text-sm text-muted">
            <Link className="font-medium text-club-red underline dark:text-red-300" href="/login">
              Sign in
            </Link>{" "}
            to track imports you submit or games where your player profile appears.
          </p>
          <Link href="/import" className="btn-primary mt-5 inline-flex h-11 px-6">
            Import scores
          </Link>
        </div>
      </main>
    );
  }

  const hasImports = imports.length > 0;
  const hasSessions = sessions.length > 0;
  const isEmpty = signedIn && !hasImports && !hasSessions;

  return (
    <main className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold leading-[1.1] tracking-tight text-club-ink sm:text-3xl">My games</h1>
          <p className="text-muted max-w-2xl text-sm leading-6">
            Imported matches tied to your account. Most club nights end with a quick score import.
          </p>
        </div>
        <Link href="/import" className="btn-primary inline-flex h-11 shrink-0 px-6">
          Import scores
        </Link>
      </div>

      {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      {isEmpty ? (
        <div className="card border-dashed p-8 text-center">
          <p className="text-sm text-muted">No imported games on your account yet.</p>
          <p className="mt-2 text-xs text-subtle">
            Import a finished match while signed in — it will show up here automatically.
          </p>
          <Link href="/import" className="btn-primary mt-6 inline-flex h-11 px-6">
            Import your first game
          </Link>
        </div>
      ) : null}

      {hasImports ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-club-ink">Imported games</h2>
          <div className="card divide-y divide-club-border">
            <ul>
              {imports.map((row) => (
                <ImportedGameSummaryCard key={row.id} row={row} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {hasSessions ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-club-ink">Live sessions</h2>
              <p className="text-xs text-subtle">
                Round-by-round tracking —{" "}
                <Link href="/experimental" className="underline">
                  experimental
                </Link>
              </p>
            </div>
          </div>
          <div className="card">
            <ul className="divide-y divide-club-border">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/s/${s.share_id}`}
                    className="flex items-center justify-between px-4 py-4 transition-colors duration-300 hover:bg-club-surface/50"
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
                      <div className="text-xs text-subtle">{new Date(s.created_at).toLocaleString()}</div>
                    </div>
                    <span className="text-sm font-medium text-muted">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
