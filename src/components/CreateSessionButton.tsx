"use client";

import { useCreateSession } from "@/hooks/useCreateSession";

type Props = {
  label?: string;
  className?: string;
  fullWidth?: boolean;
};

export function CreateSessionButton({
  label = "New game",
  className = "",
  fullWidth = false,
}: Props) {
  const { createSession, loading, error } = useCreateSession();

  return (
    <div className={fullWidth ? "w-full" : ""}>
      <button
        type="button"
        onClick={() => void createSession()}
        disabled={loading}
        className={
          className ||
          `inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 ${fullWidth ? "w-full" : ""}`
        }
      >
        {loading ? "Starting…" : label}
      </button>
      {error ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
