"use client";

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      if (!supabase) {
        setError(
          "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
        );
        return;
      }

      const { data, error } = await supabase
        .from("players")
        .select("id, display_name, created_at")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) setError(error.message);
      setPlayers((data ?? []) as PlayerRow[]);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onAdd() {
    setError(null);
    if (!supabase) return;
    const display_name = name.trim();
    if (!display_name) return;

    const { data, error } = await supabase
      .from("players")
      .insert({ display_name })
      .select("id, display_name, created_at")
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    setPlayers((p) => [data as PlayerRow, ...p]);
    setName("");
  }

  return (
    <main className="space-y-6">
      <PageHeader
        title="Players"
        description="Simple player profiles (names). Assign them to seats when you start a game."
      />

      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="h-11 flex-1 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-club-red/30 dark:border-stone-700 dark:bg-stone-950"
          />
          <button onClick={() => void onAdd()} className="btn-primary h-11 px-4">
            Add player
          </button>
        </div>
        {error ? (
          <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : null}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold dark:border-stone-800">
          All players
        </div>
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.display_name}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{p.id}</div>
              </div>
            </li>
          ))}
          {players.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-600 dark:text-zinc-300">
              No players yet.
            </li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}

