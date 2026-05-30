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
          `btn-primary h-11 disabled:opacity-50 ${fullWidth ? "w-full" : ""}`
        }
      >
        {loading ? "Starting…" : label}
      </button>
      {error ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
