"use client";

import Link from "next/link";

import { useIsClient } from "@/hooks/useClientStorage";
import { getRecentSession } from "@/lib/recentSession";

export function RecentSessionCard() {
  const isClient = useIsClient();
  if (!isClient) return null;

  const recent = getRecentSession();
  if (!recent) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-club-jade/30 bg-club-jade-muted/80 p-5 shadow-sm dark:border-teal-900/50 dark:bg-club-jade-muted">
      <div className="text-xs font-semibold uppercase tracking-wide text-club-jade dark:text-teal-300">
        Continue last game
      </div>
      <div className="mt-1 text-lg font-bold tracking-tight">{recent.title}</div>
      <div className="mt-1 text-xs text-teal-800/70 dark:text-teal-300/70">
        Last opened {new Date(recent.visitedAt).toLocaleString()}
      </div>
      <Link
        href={`/s/${recent.shareId}`}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-club-jade text-sm font-semibold text-white shadow-sm hover:bg-teal-800 sm:w-auto sm:px-6"
      >
        Resume game
      </Link>
    </div>
  );
}
