"use client";

import { useEffect, useMemo, useState } from "react";

import { ImportedGameSummaryCard } from "@/components/ImportedGameSummaryCard";
import { isValidMjsPaipuUrl } from "@/lib/imports/mjsPaipu";
import type { ImportedGameRow } from "@/lib/imports/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export function MajsoulQuickImport({ onImported }: { onImported: () => void }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedGameRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkConfigured() {
      try {
        const res = await fetch("/api/imports/games/mjs");
        const json = (await res.json()) as { configured?: boolean };
        if (!cancelled) setConfigured(res.ok && json.configured === true);
      } catch {
        if (!cancelled) setConfigured(false);
      }
    }

    void checkConfigured();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = input.trim();
  const inputValid = !trimmed || isValidMjsPaipuUrl(trimmed);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setImported(null);

    if (!trimmed) {
      setError("Paste a Mahjong Soul game ID or share link.");
      return;
    }
    if (!inputValid) {
      setError("That doesn't look like a Mahjong Soul game ID or log link.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const token = sessionData.session?.access_token;
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/imports/games/mjs", {
        method: "POST",
        headers,
        body: JSON.stringify({ input: trimmed }),
      });
      const json = (await res.json()) as { import?: ImportedGameRow; error?: string };
      if (!res.ok || !json.import) throw new Error(json.error ?? "Import failed");

      setImported(json.import);
      setInput("");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Stay out of the way until we know the server can actually do lookups.
  if (configured !== true) return null;

  return (
    <div className="card min-w-0 max-w-full overflow-x-clip">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3.5 p-4 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold">Add from Mahjong Soul</h2>
          <p className="mt-1 text-xs leading-5 text-subtle">
            Paste a finished game&apos;s ID or share link and it is imported straight away —
            players, scores, and end time are read from the log.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="250728-abc12345-… or https://mahjongsoul.game.yo-star.com/?paipu=…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="field h-11 w-full min-w-0 flex-1 px-3 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary h-11 w-full shrink-0 rounded-xl px-5 text-sm font-semibold disabled:opacity-40 sm:w-auto"
          >
            {submitting ? "Looking up…" : "Import"}
          </button>
        </div>

        {trimmed && !inputValid ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            Link format not recognized.
          </p>
        ) : null}

        {submitting ? (
          <p className="text-xs text-subtle">
            Signing in to Mahjong Soul and fetching the log — this takes a few seconds.
          </p>
        ) : null}

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </form>

      {imported ? (
        <div className="border-t border-club-border">
          <div className="px-4 pt-3 text-xs font-medium text-emerald-700 sm:px-6 dark:text-emerald-400">
            Imported — this game now counts on the leaderboard.
          </div>
          <ul>
            <ImportedGameSummaryCard row={imported} />
          </ul>
        </div>
      ) : null}
    </div>
  );
}
