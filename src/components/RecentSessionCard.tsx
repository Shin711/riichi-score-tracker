"use client";

import Link from "next/link";
import { useState } from "react";

import { getRecentSession, type RecentSession } from "@/lib/recentSession";

export function RecentSessionCard() {
  const [recent] = useState<RecentSession | null>(() =>
    typeof window === "undefined" ? null : getRecentSession()
  );

  if (!recent) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
      <div className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
        Continue last game
      </div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{recent.title}</div>
      <div className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-300/70">
        Last opened {new Date(recent.visitedAt).toLocaleString()}
      </div>
      <Link
        href={`/s/${recent.shareId}`}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-700 text-sm font-medium text-white hover:bg-emerald-600 sm:w-auto sm:px-6"
      >
        Resume game
      </Link>
    </div>
  );
}
