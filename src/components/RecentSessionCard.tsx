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
    <div className="jade-panel shadow-sm">
      <div className="jade-panel-label">Continue last game</div>
      <div className="jade-panel-fg mt-1 text-lg font-bold tracking-tight">{recent.title}</div>
      <div className="jade-panel-muted mt-1">
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
