import { CreateSessionCard } from "@/components/CreateSessionCard";

export default function Home() {
  return (
    <main className="font-sans">
      <div className="grid gap-8 md:grid-cols-2">
        <CreateSessionCard />

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-2xl font-semibold tracking-tight">Open session</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Paste a session URL in the address bar, or keep it bookmarked for your group.
          </p>
          <div className="mt-5 text-sm text-zinc-600 dark:text-zinc-300">
            Example: <span className="font-mono">/s/&lt;shareId&gt;</span>
          </div>
        </div>
      </div>
    </main>
  );
}
