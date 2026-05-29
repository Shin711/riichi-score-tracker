import { ImportGameForm } from "@/components/ImportGameForm";

export default function ImportPage() {
  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import game</h1>
        <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
          Add a finished friendly match from Mahjong Soul or elsewhere. Scores count on the monthly
          leaderboard alongside in-person sessions.
        </p>
      </div>
      <ImportGameForm />
    </main>
  );
}
