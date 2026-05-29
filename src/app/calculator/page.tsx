import { ScoreCalculator } from "@/components/ScoreCalculator";

export const metadata = {
  title: "Score calculator",
  description: "Calculate riichi mahjong hand payments for beginners — ron, tsumo, han and fu.",
};

export default function CalculatorPage() {
  return (
    <main className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Score calculator</h1>
        <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          New to scoring? Answer a few questions and see how many points you should collect. No account
          or game session needed.
        </p>
      </div>
      <ScoreCalculator />
    </main>
  );
}
