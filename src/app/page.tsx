import Link from "next/link";

import { CreateSessionCard } from "@/components/CreateSessionCard";
import { PageHeader } from "@/components/PageHeader";
import { RecentSessionCard } from "@/components/RecentSessionCard";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const WINDS = ["東", "南", "西", "北"] as const;

export default function Home() {
  return (
    <main className="space-y-6">
      <PageHeader title={SITE_NAME} description={SITE_DESCRIPTION} badge="Riichi mahjong" />

      <div className="flex justify-center gap-2 py-1" aria-hidden>
        {WINDS.map((wind) => (
          <span
            key={wind}
            className="flex h-10 w-8 items-center justify-center rounded-md border border-stone-200/80 bg-white/70 text-sm font-bold text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200"
          >
            {wind}
          </span>
        ))}
      </div>

      <RecentSessionCard />

      <div className="grid gap-6 md:grid-cols-2">
        <CreateSessionCard />

        <div className="card p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-club-gold-muted text-sm font-bold text-club-gold">
              符
            </span>
            <h2 className="text-lg font-bold tracking-tight">Score calculator</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
            Learning riichi scoring? Work out ron and tsumo payments from han and fu — no game session
            required.
          </p>
          <Link href="/calculator" className="btn-secondary mt-4 h-10 px-4">
            Open calculator
          </Link>
        </div>

        <div className="card p-6 md:col-span-2">
          <h2 className="text-lg font-bold tracking-tight">At the table</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["Add player names", "Players"],
              ["Start a session", "New game"],
              ["Share the viewer link", "Live scores"],
              ["Record each hand", "Undo if needed"],
            ].map(([step, hint], i) => (
              <li
                key={step}
                className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3 dark:border-stone-800 dark:bg-stone-800/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-club-red text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="text-sm">
                  <span className="font-medium text-stone-900 dark:text-stone-100">{step}</span>
                  <span className="mt-0.5 block text-xs text-stone-500">{hint}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
