"use client";

import { useCreateSession } from "@/hooks/useCreateSession";

export function CreateSessionCard() {
  const { createSession, loading, error } = useCreateSession();

  return (
    <div className="card-accent card-interactive relative overflow-hidden p-6 sm:p-7">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-club-red/40 via-club-gold/30 to-club-jade/40"
        aria-hidden
      />
      <h2 className="text-xl font-bold tracking-tight text-club-ink">Start a live session</h2>
      <p className="text-muted mt-2 text-sm leading-6">
        One person creates the session on their phone and records each hand. Everyone else can follow
        along on the viewer link. For end-of-night leaderboard updates, use{" "}
        <span className="font-medium text-club-ink">Import</span> instead.
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={() => void createSession()}
          disabled={loading}
          className="btn-primary h-12 w-full sm:w-auto"
        >
          {loading ? "Starting…" : "Start live session"}
        </button>
      </div>
      {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
