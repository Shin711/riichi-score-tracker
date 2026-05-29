import { CreateSessionCard } from "@/components/CreateSessionCard";
import { RecentSessionCard } from "@/components/RecentSessionCard";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function Home() {
  return (
    <main className="space-y-6 font-sans">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{SITE_NAME}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">{SITE_DESCRIPTION}</p>
      </div>

      <RecentSessionCard />

      <div className="grid gap-6 md:grid-cols-2">
        <CreateSessionCard />

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">At the table</h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <li>
              <span className="font-medium text-zinc-950 dark:text-zinc-100">1.</span> Add player names under{" "}
              <span className="font-medium">Players</span>
            </li>
            <li>
              <span className="font-medium text-zinc-950 dark:text-zinc-100">2.</span> Tap{" "}
              <span className="font-medium">New game</span> and assign seats
            </li>
            <li>
              <span className="font-medium text-zinc-950 dark:text-zinc-100">3.</span> Share the viewer link so
              others can watch scores update
            </li>
            <li>
              <span className="font-medium text-zinc-950 dark:text-zinc-100">4.</span> Record each hand as you
              play — use <span className="font-medium">Undo</span> if you make a mistake
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
