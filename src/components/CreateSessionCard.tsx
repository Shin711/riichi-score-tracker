"use client";

import { useCreateSession } from "@/hooks/useCreateSession";

export function CreateSessionCard() {
  const { createSession, loading, error } = useCreateSession();

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight">Start a new game</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        One person at the table creates the session on their phone. Everyone else opens the viewer link to
        follow scores live.
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={() => void createSession()}
          disabled={loading}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto sm:px-6"
        >
          {loading ? "Starting…" : "New game"}
        </button>
      </div>
      {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
