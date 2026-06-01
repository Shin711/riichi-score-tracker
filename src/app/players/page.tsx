"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";

import type { PlayerRow } from "@/lib/db/types";
import { getSupabaseClient } from "@/lib/supabase/client";

function useSupabaseOrNull() {
  return useMemo(() => getSupabaseClient(), []);
}

export default function PlayersPage() {
  const supabase = useSupabaseOrNull();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      if (!supabase) {
        setError(
          "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
        );
        setSignedIn(false);
        setIsAdmin(false);
        return;
      }

      const { data, error: loadErr } = await supabase
        .from("players")
        .select("id, display_name, created_at")
        .order("created_at", { ascending: false });

      if (!cancelled) {
        if (loadErr) setError(loadErr.message);
        else setPlayers((data ?? []) as PlayerRow[]);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setSignedIn(false);
          setIsAdmin(false);
        }
        return;
      }

      const res = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        signedIn?: boolean;
        isAdmin?: boolean;
      };

      if (!cancelled) {
        setSignedIn(json.signedIn === true);
        setIsAdmin(json.isAdmin === true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onAdd() {
    setError(null);
    setStatus(null);
    if (!supabase) return;
    const display_name = name.trim();
    if (!display_name) return;

    const { data, error: insertErr } = await supabase
      .from("players")
      .insert({ display_name })
      .select("id, display_name, created_at")
      .single();

    if (insertErr) {
      setError(insertErr.message);
      return;
    }

    setPlayers((p) => [data as PlayerRow, ...p]);
    setName("");
  }

  async function confirmDelete(player: PlayerRow) {
    if (!supabase) return;
    setError(null);
    setStatus(null);
    setDeletingId(player.id);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Sign in required to delete players.");
        return;
      }

      const res = await fetch(`/api/players/${player.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        error?: string;
        sessionsUnlinked?: number;
        importsUnlinked?: number;
      };

      if (!res.ok) {
        setError(json.error ?? "Failed to delete player.");
        return;
      }

      setPlayers((prev) => prev.filter((p) => p.id !== player.id));
      setConfirmDeleteId(null);
      const parts = [`Removed ${player.display_name} from the roster.`];
      if (json.sessionsUnlinked) {
        parts.push(`${json.sessionsUnlinked} game(s) unlinked (scores kept for other players).`);
      }
      if (json.importsUnlinked) {
        parts.push(`${json.importsUnlinked} import(s) kept (entry unlinked from leaderboard).`);
      }
      setStatus(parts.join(" "));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="space-y-6">
      <PageHeader
        title="Players"
        description="Simple player profiles (names). Assign them to seats when you start a game."
      />

      {isAdmin ? (
        <p className="text-xs text-subtle">
          Signed in as admin — you can remove invalid player profiles. Sessions, imports, and
          other players&apos; leaderboard scores are kept.
        </p>
      ) : signedIn === false ? (
        <p className="text-xs text-subtle">
          Player deletion is admin-only.{" "}
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>{" "}
          if you manage the club roster.
        </p>
      ) : null}

      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="field h-11 flex-1 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-club-red/30"
          />
          <button onClick={() => void onAdd()} className="btn-primary h-11 px-4">
            Add player
          </button>
        </div>
        {error ? (
          <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : null}
        {status ? (
          <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{status}</div>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-club-border px-4 py-3 text-sm font-semibold text-club-ink">
          All players
        </div>
        <ul className="divide-club">
          {players.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate font-medium text-club-ink">{p.display_name}</div>
                <div className="text-xs text-subtle">{p.id}</div>
              </div>
              {isAdmin ? (
                confirmDeleteId === p.id ? (
                  <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/40">
                    <p className="text-xs leading-5 text-red-900 dark:text-red-200">
                      Remove{" "}
                      <span className="font-medium">{p.display_name}</span> from the roster?
                      Their player links are removed; sessions, imports, and other players&apos;
                      scores are kept. This cannot be undone.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deletingId === p.id}
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-9 rounded-lg border border-stone-200 bg-club-surface px-3 text-xs font-medium dark:border-stone-600 dark:text-stone-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === p.id}
                        onClick={() => void confirmDelete(p)}
                        className="h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {deletingId === p.id ? "Deleting…" : "Yes, delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteId(p.id);
                      setStatus(null);
                    }}
                    className="shrink-0 text-xs text-red-600 underline dark:text-red-400"
                  >
                    Delete
                  </button>
                )
              ) : null}
            </li>
          ))}
          {players.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">No players yet.</li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}
