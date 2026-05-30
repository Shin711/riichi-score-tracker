"use client";

import { useCreateSession } from "@/hooks/useCreateSession";

export function CreateSessionCard() {
  const { createSession, loading, error } = useCreateSession();

  return (
    <div className="card-accent relative overflow-hidden p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-club-red via-club-gold to-club-jade"
        aria-hidden
      />
      <h2 className="text-xl font-bold tracking-tight">Start a new game</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
        One person at the table creates the session on their phone. Everyone else opens the viewer link to
        follow scores live.
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={() => void createSession()}
          disabled={loading}
          className="btn-primary h-12 w-full sm:w-auto"
        >
          {loading ? "Starting…" : "New game"}
        </button>
      </div>
      {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
